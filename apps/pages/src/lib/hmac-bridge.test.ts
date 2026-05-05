/**
 * HMAC bridge unit tests.
 *
 * Verifies the security boundary of the URL-query → cookie hand-off:
 *   - JWT signed with the wrong secret rejected
 *   - JWT bound to (eu, h) but URL queries different eu/h rejected
 *   - expired JWT rejected
 *   - cookie roundtrip preserves the envelope
 *   - cookie with elapsed exp returns null (forces re-issue)
 */

import { sign } from "hono/jwt";
import { describe, expect, test } from "vitest";

import {
  HmacBridgeInvalid,
  buildHmacCookie,
  getEndUserCredentialFromRequest,
  parseHmacCookie,
  verifyHmacEnvelopeFromQuery,
} from "./hmac-bridge";

const SECRET = "test-bridge-secret-do-not-use-in-prod";
const OTHER_SECRET = "different-bridge-secret";

async function signEnvelope(
  eu: string,
  h: string,
  expSeconds: number,
  signingKey = SECRET,
): Promise<string> {
  return sign({ eu, h, exp: expSeconds }, signingKey, "HS256");
}

describe("verifyHmacEnvelopeFromQuery", () => {
  test("accepts a freshly-signed valid triple", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = await signEnvelope("u-1", "h-1", exp);
    const result = await verifyHmacEnvelopeFromQuery(SECRET, {
      eu: "u-1",
      h: "h-1",
      sig,
    });
    expect(result.endUserId).toBe("u-1");
    expect(result.userHash).toBe("h-1");
    expect(result.exp).toBe(exp);
  });

  test("rejects signature signed with the wrong secret", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = await signEnvelope("u-1", "h-1", exp, OTHER_SECRET);
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, { eu: "u-1", h: "h-1", sig }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
  });

  test("rejects URL eu/h that doesn't match the signed payload", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = await signEnvelope("u-1", "h-1", exp);
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, {
        // attacker swaps eu, keeps the legit signature
        eu: "u-attacker",
        h: "h-1",
        sig,
      }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
  });

  test("rejects expired JWT", async () => {
    const expPast = Math.floor(Date.now() / 1000) - 60;
    const sig = await signEnvelope("u-1", "h-1", expPast);
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, { eu: "u-1", h: "h-1", sig }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
  });

  test("rejects missing fields", async () => {
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, { eu: null, h: "h", sig: "x" }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, { eu: "u", h: null, sig: "x" }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
    await expect(
      verifyHmacEnvelopeFromQuery(SECRET, { eu: "u", h: "h", sig: null }),
    ).rejects.toBeInstanceOf(HmacBridgeInvalid);
  });
});

describe("buildHmacCookie + parseHmacCookie roundtrip", () => {
  test("preserves the envelope through a real cookie value", () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const cookie = buildHmacCookie(
      { endUserId: "u-1", userHash: "h-1", exp },
      ".pages.apollokit.dev",
    );
    expect(cookie).toContain("apollo_eu_hmac=");
    expect(cookie).toContain("Domain=.pages.apollokit.dev");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");

    // Browser-style header — extract the cookie pair only.
    const cookieValueOnly = cookie.split(";")[0]!;
    const parsed = parseHmacCookie(cookieValueOnly);
    expect(parsed?.endUserId).toBe("u-1");
    expect(parsed?.userHash).toBe("h-1");
    expect(parsed?.exp).toBe(exp);
  });

  test("omits Domain= when no cookieDomain is supplied (dev)", () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const cookie = buildHmacCookie(
      { endUserId: "u", userHash: "h", exp },
      null,
    );
    expect(cookie).not.toContain("Domain=");
  });

  test("parseHmacCookie returns null for missing cookie header", () => {
    expect(parseHmacCookie(null)).toBeNull();
    expect(parseHmacCookie("")).toBeNull();
    expect(parseHmacCookie("other_cookie=foo")).toBeNull();
  });

  test("parseHmacCookie rejects elapsed exp", () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    const cookie = buildHmacCookie(
      { endUserId: "u", userHash: "h", exp },
      null,
    );
    const value = cookie.split(";")[0]!;
    expect(parseHmacCookie(value)).toBeNull();
  });

  test("parseHmacCookie rejects malformed JSON", () => {
    expect(parseHmacCookie("apollo_eu_hmac=not-json")).toBeNull();
  });

  test("MaxAge is capped at 600s even when exp is far in the future", () => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    const cookie = buildHmacCookie(
      { endUserId: "u", userHash: "h", exp },
      null,
    );
    const maxAgeMatch = cookie.match(/Max-Age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    expect(Number(maxAgeMatch![1])).toBeLessThanOrEqual(600);
  });
});

describe("getEndUserCredentialFromRequest", () => {
  test("accepts URL query and writes a cookie via setCookie callback", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = await signEnvelope("u-1", "h-1", exp);
    const url = `https://demo.pages.apollokit.dev/?eu=u-1&h=h-1&sig=${sig}`;
    const req = new Request(url);

    let captured: string | null = null;
    const result = await getEndUserCredentialFromRequest(SECRET, req, {
      cookieDomain: ".pages.apollokit.dev",
      setCookie: (v) => {
        captured = v;
      },
    });
    expect(result?.endUserId).toBe("u-1");
    expect(captured).toContain("apollo_eu_hmac=");
    expect(captured).toContain("Domain=.pages.apollokit.dev");
  });

  test("falls back to existing cookie when query is invalid", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const cookie = buildHmacCookie(
      { endUserId: "u-cookie", userHash: "h-cookie", exp },
      null,
    );
    const cookieValue = cookie.split(";")[0]!;
    // Query has a bad sig — verify path throws, then we read the cookie.
    const req = new Request(
      `https://demo.pages.apollokit.dev/?eu=u-1&h=h-1&sig=garbage`,
      { headers: { cookie: cookieValue } },
    );
    const result = await getEndUserCredentialFromRequest(SECRET, req);
    expect(result?.endUserId).toBe("u-cookie");
  });

  test("returns null when neither query nor cookie is valid", async () => {
    const req = new Request("https://demo.pages.apollokit.dev/");
    const result = await getEndUserCredentialFromRequest(SECRET, req);
    expect(result).toBeNull();
  });
});
