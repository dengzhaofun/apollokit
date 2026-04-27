/**
 * Guard for admin-side business routes.
 *
 * Accepts EITHER:
 * 1. A valid Better Auth session with an active organization, OR
 * 2. A valid admin API key (configId "admin") in the x-api-key header.
 *
 * On admin API key auth, a synthetic session-like object is placed on the
 * context so downstream handlers can read `c.var.session!.activeOrganizationId!`
 * uniformly regardless of auth method.
 *
 * Mount per-router, not globally.
 */

import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import type { HonoEnv } from "../env";
import { UnauthorizedError } from "./auth-errors";

export const requireAdminOrApiKey = createMiddleware<HonoEnv>(
  async (c, next) => {
    // Path 1: session auth (already resolved by global session middleware)
    if (c.var.user && c.var.session?.activeOrganizationId) {
      // authMethod already set to "session" by session middleware
      return next();
    }

    // Path 2: admin API key
    const apiKeyHeader = c.req.header("x-api-key");
    if (apiKeyHeader) {
      const result = await auth.api.verifyApiKey({
        body: { key: apiKeyHeader, configId: "admin" },
      });
      if (result.valid && result.key) {
        // Synthesize session-like context so handlers read orgId uniformly
        c.set("session", {
          activeOrganizationId: result.key.referenceId,
        } as NonNullable<typeof c.var.session>);
        c.set("user", null);
        c.set("authMethod", "admin-api-key");
        return next();
      }
    }

    throw new UnauthorizedError();
  },
);
