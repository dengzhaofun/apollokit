/**
 * Webhook-specific crypto helpers.
 *
 * Sits on top of `lib/crypto.ts` (shared AES-GCM / HMAC primitives used
 * by client-credentials too) and adds:
 *
 *   - `generateSigningSecret()` — mint a `whsec_…` 256-bit token.
 *   - `redactSecret()`          — `whsec_abcd…wxyz` for UI display.
 *   - `signDelivery()`          — compute the outbound
 *                                 `X-Apollokit-Signature` header value.
 *
 * The signing scheme is HMAC-SHA256 over `<timestamp>.<rawBody>`. The
 * timestamp and signature go in headers (`X-Apollokit-Timestamp`,
 * `X-Apollokit-Signature: v1=<hex>`) so receivers can verify without
 * parsing JSON first. See the verification snippet in the module
 * README / docs.
 */

import { computeHmac } from "../../lib/crypto";

const SECRET_PREFIX = "whsec_";

/**
 * Generate a signing secret string. 256 bits of entropy (2× randomUUID,
 * hyphens stripped) formatted as `whsec_<64 hex>` — matches the shape
 * documented for receivers.
 */
export function generateSigningSecret(): string {
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return `${SECRET_PREFIX}${a}${b}`;
}

/**
 * Turn `whsec_abcdef…xyz` into `whsec_abcd…xyz` for safe display in
 * admin UI. Receivers never need this — it's purely a listing aid.
 */
export function redactSecret(secret: string): string {
  if (!secret.startsWith(SECRET_PREFIX)) {
    // Unknown shape — fall back to first/last 4 with a single ellipsis
    // so we never accidentally echo a whole foreign token.
    const head = secret.slice(0, 4);
    const tail = secret.slice(-4);
    return `${head}…${tail}`;
  }
  const rest = secret.slice(SECRET_PREFIX.length);
  const head = rest.slice(0, 4);
  const tail = rest.slice(-4);
  return `${SECRET_PREFIX}${head}…${tail}`;
}

/**
 * Compute the `X-Apollokit-Signature` value for a delivery.
 *
 * Input to HMAC is `<unix_seconds>.<rawBody>` — both sides reconstruct
 * this exact string, so any reframing of the body by middlebox proxies
 * (content-encoding changes, whitespace) will fail verification, which
 * is the correct behavior.
 *
 * Returns just the `v1=<hex>` value; the header also carries the
 * timestamp separately so receivers don't have to split.
 */
export async function signDelivery(params: {
  secret: string;
  timestamp: number; // unix seconds
  rawBody: string;
}): Promise<string> {
  const data = `${params.timestamp}.${params.rawBody}`;
  const hex = await computeHmac(data, params.secret);
  return `v1=${hex}`;
}
