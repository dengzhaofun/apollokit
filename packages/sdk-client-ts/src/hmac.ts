/**
 * HMAC-SHA256 signing for client credential authentication.
 *
 * Mirrors the server's implementation in apps/server/src/lib/crypto.ts.
 * Uses the Web Crypto API — works in browsers, Node 18+, Deno,
 * Cloudflare Workers, and Cocos Creator (WebGL).
 */

/**
 * Compute HMAC-SHA256 of `endUserId` using `secret`, returning a hex string.
 */
export async function computeHmac(
  endUserId: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(endUserId),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
