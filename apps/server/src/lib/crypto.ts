/**
 * Cryptographic utilities for client credential management.
 *
 * Uses the Web Crypto API (native in Cloudflare Workers, no polyfills needed).
 *
 * - AES-256-GCM for encrypting/decrypting client secrets (csk_)
 * - HMAC-SHA256 for verifying end-user identity
 * - HKDF for deriving encryption keys from BETTER_AUTH_SECRET
 *
 * The encryption key is derived deterministically from the app secret so we
 * don't need an extra env var. Key derivation uses HKDF with a fixed salt
 * and info string — changing either invalidates all stored secrets.
 */

const HKDF_SALT = new TextEncoder().encode("apollokit-client-credentials");
const HKDF_INFO = new TextEncoder().encode("aes-256-gcm-encryption");
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption / decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext with AES-256-GCM. Returns `base64(iv + ciphertext)`.
 * The 12-byte IV is prepended to the ciphertext so decrypt can extract it.
 */
export async function encrypt(
  plaintext: string,
  appSecret: string,
): Promise<string> {
  const key = await deriveEncryptionKey(appSecret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  // Concat IV + ciphertext into one buffer
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a value produced by `encrypt()`.
 */
export async function decrypt(
  encrypted: string,
  appSecret: string,
): Promise<string> {
  const key = await deriveEncryptionKey(appSecret);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 of `data` using `secret`, returning a hex string.
 */
export async function computeHmac(
  data: string,
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
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time comparison of two HMAC hex strings.
 */
export async function verifyHmac(
  data: string,
  secret: string,
  hash: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // Convert the provided hex hash back to bytes for constant-time verify
  const hashBytes = new Uint8Array(
    hash.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hashBytes,
    new TextEncoder().encode(data),
  );
}

// ---------------------------------------------------------------------------
// Key pair generation
// ---------------------------------------------------------------------------

/**
 * Generate a random key string with the given prefix.
 * Uses crypto.randomUUID() twice for 256 bits of entropy, formatted as a
 * compact hex-like string.
 */
function generateKey(prefix: string): string {
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${a}${b}`;
}

/**
 * Generate a publishable key + secret key pair for client credentials.
 */
export function generateKeyPair(): {
  publishableKey: string;
  secret: string;
} {
  return {
    publishableKey: generateKey("cpk_"),
    secret: generateKey("csk_"),
  };
}
