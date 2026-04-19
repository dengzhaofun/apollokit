/**
 * Tests for the crypto utility module.
 *
 * These are pure unit tests — no database, no network. They exercise
 * AES-256-GCM encryption/decryption, HMAC-SHA256, and key pair generation.
 */
import { describe, expect, test } from "vitest";

import {
  encrypt,
  decrypt,
  computeHmac,
  verifyHmac,
  generateKeyPair,
} from "./crypto";

const APP_SECRET = "test-secret-for-crypto-tests";

describe("AES-256-GCM encrypt / decrypt", () => {
  test("round-trip preserves plaintext", async () => {
    const plaintext = "csk_abcdef1234567890";
    const encrypted = await encrypt(plaintext, APP_SECRET);
    const decrypted = await decrypt(encrypted, APP_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypted output is base64 and differs from plaintext", async () => {
    const plaintext = "hello world";
    const encrypted = await encrypt(plaintext, APP_SECRET);
    expect(encrypted).not.toBe(plaintext);
    // Should be valid base64
    expect(() => atob(encrypted)).not.toThrow();
  });

  test("two encryptions of same plaintext produce different ciphertext", async () => {
    const plaintext = "same-text";
    const a = await encrypt(plaintext, APP_SECRET);
    const b = await encrypt(plaintext, APP_SECRET);
    expect(a).not.toBe(b); // different IVs
  });

  test("wrong secret fails to decrypt", async () => {
    const encrypted = await encrypt("secret-data", APP_SECRET);
    await expect(decrypt(encrypted, "wrong-secret")).rejects.toThrow();
  });
});

describe("HMAC-SHA256", () => {
  test("computeHmac returns hex string", async () => {
    const hash = await computeHmac("user-123", "my-secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
  });

  test("verifyHmac returns true for correct hash", async () => {
    const secret = "hmac-secret";
    const data = "user-456";
    const hash = await computeHmac(data, secret);
    const valid = await verifyHmac(data, secret, hash);
    expect(valid).toBe(true);
  });

  test("verifyHmac returns false for wrong hash", async () => {
    const hash = await computeHmac("user-789", "secret-a");
    const valid = await verifyHmac("user-789", "secret-b", hash);
    expect(valid).toBe(false);
  });

  test("verifyHmac returns false for tampered data", async () => {
    const secret = "shared";
    const hash = await computeHmac("original", secret);
    const valid = await verifyHmac("tampered", secret, hash);
    expect(valid).toBe(false);
  });

  test("different secrets produce different HMACs", async () => {
    const data = "same-data";
    const a = await computeHmac(data, "secret-1");
    const b = await computeHmac(data, "secret-2");
    expect(a).not.toBe(b);
  });
});

describe("generateKeyPair", () => {
  test("publishableKey has cpk_ prefix", () => {
    const { publishableKey } = generateKeyPair();
    expect(publishableKey).toMatch(/^cpk_[0-9a-f]{64}$/);
  });

  test("secret has csk_ prefix", () => {
    const { secret } = generateKeyPair();
    expect(secret).toMatch(/^csk_[0-9a-f]{64}$/);
  });

  test("two calls produce different pairs", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.publishableKey).not.toBe(b.publishableKey);
    expect(a.secret).not.toBe(b.secret);
  });
});

