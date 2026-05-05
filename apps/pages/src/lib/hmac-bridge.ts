/**
 * HMAC bridge — for `authMode: 'hmac_external'` projects.
 *
 * The integrator's backend pre-signs a `(endUserId, exp)` envelope with
 * `PAGES_SIGNING_SECRET` (the platform-issued bridge key, NOT the cred
 * `csk_`) and also pre-computes the HMAC of `endUserId` against the
 * cred's `csk_` so the pages worker never sees the raw csk. The result
 * is two opaque tokens delivered to the player's browser:
 *
 *   - `eu`  — endUserId
 *   - `h`   — `HMAC-SHA256(endUserId, csk_)` hex (= `x-user-hash` value
 *             the pages worker forwards to /api/v1/client/*)
 *   - `exp` — unix seconds; bridge envelope expires
 *   - `sig` — `HMAC-SHA256(${eu}.${h}.${exp}, PAGES_SIGNING_SECRET)`
 *             hex; binds the (eu, h, exp) triple together so a
 *             leaked-and-replayed eu/h pair stops working at exp.
 *
 * Two transport channels:
 *
 *   - **URL query** — first-load redirect: `?eu=&h=&exp=&sig=`. The
 *     pages worker SSR validates the sig, then writes the triple into
 *     a HttpOnly cookie `apollo_eu_hmac` scoped to
 *     `.pages.apollokit.dev` so subsequent navigation doesn't need
 *     re-signing. Cookie TTL == `exp - now` (capped at 10 min).
 *
 *   - **postMessage** — when pages is iframed by the integrator; the
 *     parent posts `{ type: 'apollo:hmac', eu, h, exp, sig }` and the
 *     pages worker's client JS verifies + caches in sessionStorage.
 *     SSR doesn't see this path — first paint is unauthenticated, the
 *     authenticated re-render happens on hydrate.
 *
 * This file is the verifier (URL path); the postMessage handler lives
 * in client-side code and is wired up in PR 8 along with the admin
 * preview iframe.
 */

import { verify } from "hono/jwt";

const COOKIE_NAME = "apollo_eu_hmac";
const MAX_COOKIE_TTL_SECONDS = 10 * 60;

export interface HmacEnvelope {
  endUserId: string;
  userHash: string;
  exp: number;
}

export class HmacBridgeInvalid extends Error {
  constructor(public readonly reason: string) {
    super(`hmac bridge invalid: ${reason}`);
    this.name = "HmacBridgeInvalid";
  }
}

/**
 * Verify a URL-query HMAC envelope. Throws `HmacBridgeInvalid` on
 * every failure path; pages worker SSR catches and falls back to
 * "no end-user identity" rendering (auth-gated blocks render the
 * auth fallback instead).
 *
 * `sig` format: a JWT signed with HS256 over `{ eu, h, exp }`. We
 * could roll our own HMAC here but `hono/jwt`'s `verify` is already
 * audited and identical in shape to the preview-token verifier.
 */
export async function verifyHmacEnvelopeFromQuery(
  signingKey: string,
  query: { eu?: string | null; h?: string | null; sig?: string | null },
): Promise<HmacEnvelope> {
  if (!query.eu || !query.h || !query.sig) {
    throw new HmacBridgeInvalid("missing eu / h / sig");
  }

  let decoded: unknown;
  try {
    decoded = await verify(query.sig, signingKey, "HS256");
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "signature or expiry check failed";
    throw new HmacBridgeInvalid(reason);
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new HmacBridgeInvalid("malformed payload");
  }
  const payload = decoded as Record<string, unknown>;
  if (
    typeof payload.eu !== "string" ||
    typeof payload.h !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new HmacBridgeInvalid("malformed payload fields");
  }

  // Bind the URL-supplied (eu, h) to what the JWT was signed for.
  // Without this, an attacker could swap the URL `eu=` to another
  // user while keeping a valid sig from the original session.
  if (payload.eu !== query.eu || payload.h !== query.h) {
    throw new HmacBridgeInvalid("query / signed payload mismatch");
  }

  return {
    endUserId: payload.eu,
    userHash: payload.h,
    exp: payload.exp,
  };
}

/**
 * Build a Set-Cookie header value for the HMAC envelope. Used by the
 * SSR redirect path after verifyHmacEnvelopeFromQuery succeeds.
 */
export function buildHmacCookie(
  envelope: HmacEnvelope,
  cookieDomain: string | null,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(0, envelope.exp - nowSeconds);
  const maxAge = Math.min(remainingSeconds, MAX_COOKIE_TTL_SECONDS);
  const value = encodeURIComponent(
    JSON.stringify({
      eu: envelope.endUserId,
      h: envelope.userHash,
      exp: envelope.exp,
    }),
  );
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
  ];
  if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
  return parts.join("; ");
}

/**
 * Parse the HMAC envelope out of a cookie header. Returns null when:
 *   - the cookie is absent
 *   - JSON parsing fails
 *   - exp has elapsed (caller should treat as expired and re-issue)
 *
 * No JWT verification is repeated here — the cookie is SameSite=Lax,
 * HttpOnly, Secure, set by us; the only way it carries a value is
 * `verifyHmacEnvelopeFromQuery` wrote it. A future hardening pass can
 * add a per-cookie HMAC if we ever loosen those flags.
 */
export function parseHmacCookie(cookieHeader: string | null): HmacEnvelope | null {
  if (!cookieHeader) return null;
  const target = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!target) return null;
  const raw = target.slice(COOKIE_NAME.length + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.eu !== "string" ||
    typeof obj.h !== "string" ||
    typeof obj.exp !== "number"
  ) {
    return null;
  }
  if (obj.exp <= Math.floor(Date.now() / 1000)) return null;
  return { endUserId: obj.eu, userHash: obj.h, exp: obj.exp };
}

/**
 * High-level bridge: given an SSR Request, resolve to an end-user
 * credential (eu, h) by checking, in order: URL query (write a fresh
 * cookie if valid), then existing cookie. Returns null when neither
 * path produces a verifiable envelope — the pages worker treats null
 * as "anonymous / unsigned" and renders accordingly.
 *
 * The optional `setCookie` callback lets the caller attach
 * `Set-Cookie` to its response without coupling this lib to a Web
 * Response object.
 */
export async function getEndUserCredentialFromRequest(
  signingKey: string,
  request: Request,
  options: {
    cookieDomain?: string | null;
    setCookie?: (cookieValue: string) => void;
  } = {},
): Promise<HmacEnvelope | null> {
  const url = new URL(request.url);
  const eu = url.searchParams.get("eu");
  const h = url.searchParams.get("h");
  const sig = url.searchParams.get("sig");
  if (eu && h && sig) {
    try {
      const envelope = await verifyHmacEnvelopeFromQuery(signingKey, {
        eu,
        h,
        sig,
      });
      if (options.setCookie) {
        options.setCookie(buildHmacCookie(envelope, options.cookieDomain ?? null));
      }
      return envelope;
    } catch {
      // fall through to cookie path — query was malformed but maybe the
      // operator already has a valid session cookie from a prior visit.
    }
  }
  return parseHmacCookie(request.headers.get("cookie"));
}

export const HMAC_COOKIE_NAME = COOKIE_NAME;
