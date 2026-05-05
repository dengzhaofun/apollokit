/**
 * Preview-token signer/verifier for the pages worker.
 *
 * The admin dashboard renders the live draft of a page project inside an
 * iframe pointed at `https://pages.apollokit.dev/__preview/<projectId>?v=<id>&t=<jwt>`.
 * The pages worker can NOT reach the admin DB directly, but it can verify
 * the JWT — so we sign a short-lived token here on the server, hand it to
 * the admin UI, and the pages worker accepts only requests carrying a
 * valid token.
 *
 * Pattern matches `lib/analytics/jwt.ts` — `hono/jwt` HS256 over a shared
 * secret (`PAGES_PREVIEW_SECRET` env var), no `jsonwebtoken` dep.
 *
 * Why a JWT and not a DB-backed token table?
 *  - 5-minute TTL means there's nothing worth revoking; let the clock
 *    invalidate it.
 *  - The pages worker does not need to talk back to the admin DB; the
 *    payload is self-describing.
 *  - One env var (PAGES_PREVIEW_SECRET) is the only piece of state to
 *    keep in sync between admin and pages.
 */

import { sign, verify } from "hono/jwt";

import { PagePreviewTokenInvalid } from "./errors";
import type { PreviewTokenPayload } from "./types";

const DEFAULT_TTL_SECONDS = 5 * 60;

/**
 * Sign a JWT that authorizes one admin user to view ONE specific draft
 * version of ONE specific page project. The pages worker re-verifies on
 * every request — there is no caching, no nonce table.
 */
export async function signPreviewToken(
  signingKey: string,
  projectId: string,
  versionId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: PreviewTokenPayload = {
    projectId,
    versionId,
    iat: now,
    exp: now + ttlSeconds,
  };
  return sign(payload, signingKey, "HS256");
}

/**
 * Verify a preview JWT and return its payload. Throws
 * `PagePreviewTokenInvalid` on every failure mode (bad signature, expired,
 * project/version mismatch). The pages worker catches this and returns a
 * 401 — never a 500.
 *
 * `expectedProjectId` is checked here (not in the JWT lib) so a token
 * signed for project A can't be replayed against project B's URL.
 */
export async function verifyPreviewToken(
  signingKey: string,
  token: string,
  expectedProjectId: string,
): Promise<PreviewTokenPayload> {
  let decoded: unknown;
  try {
    decoded = await verify(token, signingKey, "HS256");
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "signature or expiry check failed";
    throw new PagePreviewTokenInvalid(reason);
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).projectId !== "string" ||
    typeof (decoded as Record<string, unknown>).versionId !== "string"
  ) {
    throw new PagePreviewTokenInvalid("malformed payload");
  }

  const payload = decoded as PreviewTokenPayload;
  if (payload.projectId !== expectedProjectId) {
    throw new PagePreviewTokenInvalid(
      "token projectId does not match URL projectId",
    );
  }
  return payload;
}
