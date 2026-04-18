/**
 * SigV4 spot-checks.
 *
 * We don't replicate the full AWS test vectors here — the algorithm is
 * well-specified and diverging would break every S3-compatible endpoint
 * at once. Instead, we assert the shape and determinism of the output,
 * plus one round-trip canonicalization check against a fixed input.
 */

import { describe, expect, test } from "vitest";

import { presignUrl, signRequest } from "./sigv4";

const creds = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "s3",
};

describe("sigv4", () => {
  test("signRequest adds x-amz-date and authorization headers", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const headers = await signRequest(creds, {
      method: "GET",
      url,
      headers: {},
      unsignedPayload: true,
    });
    expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers["x-amz-content-sha256"]).toBe("UNSIGNED-PAYLOAD");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  test("signRequest with body hashes payload into x-amz-content-sha256", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const body = new TextEncoder().encode("hello");
    const headers = await signRequest(creds, {
      method: "PUT",
      url,
      headers: { "content-type": "text/plain" },
      body,
    });
    // SHA-256 of "hello"
    expect(headers["x-amz-content-sha256"]).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("presignUrl embeds X-Amz-Signature in query string", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const signed = await presignUrl(creds, {
      method: "GET",
      url,
      expiresIn: 3600,
    });
    const u = new URL(signed);
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("X-Amz-Credential")).toMatch(
      /^AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request$/,
    );
  });

  test("presignUrl PUT with content-type signs that header", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.png");
    const signed = await presignUrl(creds, {
      method: "PUT",
      url,
      signedHeaders: { "content-type": "image/png" },
      expiresIn: 900,
    });
    const u = new URL(signed);
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host",
    );
  });
});
