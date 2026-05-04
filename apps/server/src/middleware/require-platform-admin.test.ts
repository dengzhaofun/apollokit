/**
 * Unit-level tests for the platform admin gate. We mount the middleware
 * on a tiny Hono app to exercise the role check without the full
 * server stack — just verifying the three branches (admin / non-admin
 * / unauthenticated) emit the right status + envelope.
 */
import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import type { HonoEnv } from "../env";
import { ModuleError } from "../lib/errors";
import { fail } from "../lib/response";
import { isPlatformAdmin, requirePlatformAdmin } from "./require-platform-admin";
import { UnauthorizedError } from "./auth-errors";

function buildApp(opts: { user: { role?: string } | null }) {
  const app = new Hono<HonoEnv>();
  // Inline shim of the global session middleware — set `c.var.user`
  // to whatever the test asked for, then run the gate.
  app.use("*", async (c, next) => {
    // The `as never` casts let us skip having to fully populate the
    // Better Auth user shape just for the role-check unit test.
    c.set("user", opts.user as never);
    await next();
  });
  app.use("*", requirePlatformAdmin);
  app.get("/ping", (c) => c.json({ ok: true }));
  // Mirror the global onError so ModuleError → envelope works.
  app.onError((err, c) => {
    if (err instanceof ModuleError) {
      return c.json(
        fail(err.code, err.message),
        err.httpStatus as Parameters<typeof c.json>[1],
      );
    }
    throw err;
  });
  return app;
}

describe("isPlatformAdmin", () => {
  test("admin role passes", () => {
    expect(isPlatformAdmin("admin")).toBe(true);
  });
  test("user role rejects", () => {
    expect(isPlatformAdmin("user")).toBe(false);
  });
  test("null / undefined / empty rejects", () => {
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin("")).toBe(false);
  });
  test("unknown role rejects (defense in depth — not in adminRoles)", () => {
    expect(isPlatformAdmin("superadmin")).toBe(false);
    expect(isPlatformAdmin("orgOwner")).toBe(false);
  });
});

describe("requirePlatformAdmin middleware", () => {
  test("401 when no user on context", async () => {
    // Mounting `requirePlatformAdmin` should throw `UnauthorizedError`
    // — verified via the envelope status the global onError maps to.
    const app = buildApp({ user: null });
    const res = await app.request("/ping");
    expect(res.status).toBe(new UnauthorizedError().httpStatus);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("unauthorized");
  });

  test("403 when user has 'user' role", async () => {
    const app = buildApp({ user: { role: "user" } });
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("platform.forbidden");
  });

  test("403 when user has no role at all", async () => {
    const app = buildApp({ user: {} });
    const res = await app.request("/ping");
    expect(res.status).toBe(403);
  });

  test("200 when user has 'admin' role", async () => {
    const app = buildApp({ user: { role: "admin" } });
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
