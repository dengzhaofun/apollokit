/**
 * Unit tests for the client-cors middleware. The allow-list regex is
 * the security boundary — every "should allow X" / "should NOT allow Y"
 * case lives here so a regression in the regex shows up as a red test
 * and not a quiet CORS bypass.
 *
 * `isAllowedClientOrigin` is the pure side of the middleware so we can
 * exercise it without spinning up a full Hono app for each case.
 */

import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import { clientCors, isAllowedClientOrigin } from "./client-cors";

describe("isAllowedClientOrigin", () => {
  test("accepts production wildcard pages subdomains", () => {
    expect(
      isAllowedClientOrigin("https://demo.pages.apollokit.dev"),
    ).toBe(true);
    expect(
      isAllowedClientOrigin("https://spring-checkin.pages.apollokit.dev"),
    ).toBe(true);
    expect(
      isAllowedClientOrigin("https://abc-123.pages.apollokit.dev"),
    ).toBe(true);
  });

  test("rejects pages apex (no subdomain)", () => {
    expect(isAllowedClientOrigin("https://pages.apollokit.dev")).toBe(false);
  });

  test("rejects deeper / nested wildcards on pages domain", () => {
    expect(
      isAllowedClientOrigin("https://attacker.demo.pages.apollokit.dev"),
    ).toBe(false);
  });

  test("rejects the apex apollokit.dev", () => {
    expect(isAllowedClientOrigin("https://apollokit.dev")).toBe(false);
    expect(isAllowedClientOrigin("https://www.apollokit.dev")).toBe(false);
  });

  test("accepts admin prod origin", () => {
    expect(
      isAllowedClientOrigin(
        "https://apollokit-admin.limitless-ai.workers.dev",
      ),
    ).toBe(true);
  });

  test("accepts dev hosts on localhost / lvh.me with subdomain prefix", () => {
    expect(isAllowedClientOrigin("http://localhost:3001")).toBe(true);
    expect(isAllowedClientOrigin("http://demo.localhost:3001")).toBe(true);
    expect(isAllowedClientOrigin("http://demo.lvh.me:3001")).toBe(true);
    expect(isAllowedClientOrigin("http://127.0.0.1:8787")).toBe(true);
  });

  test("rejects non-https arbitrary public hosts", () => {
    expect(isAllowedClientOrigin("https://evil.com")).toBe(false);
    expect(isAllowedClientOrigin("https://pages.apollokit.dev.evil.com")).toBe(
      false,
    );
    // sneaky lookalike
    expect(
      isAllowedClientOrigin("https://demo.pages.apollokit.dev.evil.com"),
    ).toBe(false);
  });

  test("rejects empty origin", () => {
    expect(isAllowedClientOrigin("")).toBe(false);
  });
});

describe("clientCors middleware (e2e via hono)", () => {
  function buildApp() {
    const app = new Hono();
    app.use("/api/v1/client/*", clientCors);
    app.get("/api/v1/client/ping", (c) => c.json({ ok: true }));
    return app;
  }

  test("preflight OPTIONS from allowed origin → 204 + headers", async () => {
    const app = buildApp();
    const res = await app.request("/api/v1/client/ping", {
      method: "OPTIONS",
      headers: {
        Origin: "https://demo.pages.apollokit.dev",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-api-key",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://demo.pages.apollokit.dev",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "x-api-key",
    );
  });

  test("preflight from disallowed origin → no Allow-Origin header", async () => {
    const app = buildApp();
    const res = await app.request("/api/v1/client/ping", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("real GET from allowed origin echoes the Origin", async () => {
    const app = buildApp();
    const res = await app.request("/api/v1/client/ping", {
      headers: { Origin: "https://demo.pages.apollokit.dev" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://demo.pages.apollokit.dev",
    );
  });

  test("real GET from disallowed origin → no Allow-Origin (browser blocks)", async () => {
    const app = buildApp();
    const res = await app.request("/api/v1/client/ping", {
      headers: { Origin: "https://evil.com" },
    });
    // The handler still runs server-side (the server has no way to
    // refuse a no-cookie GET); the browser is the one enforcing the
    // missing Allow-Origin header.
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
