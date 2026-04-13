/**
 * Guard for C-end client routes.
 *
 * Requires a valid client credential (cpk_ publishable key) in the
 * x-api-key header. HMAC verification of the endUserId is delegated to
 * the clientCredentialService.verifyRequest() call inside each route
 * handler, because the endUserId comes from the request body/params
 * which isn't available in middleware for GET requests.
 *
 * This middleware only validates that the publishable key exists, is
 * enabled, and is not expired — then places the org ID on context.
 *
 * For POST routes with body-based HMAC, the route handler calls
 * service.verifyRequest() with the full (publishableKey, endUserId, userHash).
 *
 * Mount per-router, not globally.
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";

import { db } from "../db";
import type { HonoEnv } from "../env";
import { clientCredentials } from "../schema/client-credential";

export const requireClientCredential = createMiddleware<HonoEnv>(
  async (c, next) => {
    const publishableKey = c.req.header("x-api-key");
    if (!publishableKey || !publishableKey.startsWith("cpk_")) {
      return c.json(
        { error: "missing or invalid x-api-key header", requestId: c.get("requestId") },
        401,
      );
    }

    const [cred] = await db
      .select({
        id: clientCredentials.id,
        organizationId: clientCredentials.organizationId,
        enabled: clientCredentials.enabled,
        expiresAt: clientCredentials.expiresAt,
        devMode: clientCredentials.devMode,
      })
      .from(clientCredentials)
      .where(eq(clientCredentials.publishableKey, publishableKey));

    if (!cred) {
      return c.json(
        { error: "invalid client credential", requestId: c.get("requestId") },
        401,
      );
    }
    if (!cred.enabled) {
      return c.json(
        { error: "client credential is disabled", requestId: c.get("requestId") },
        401,
      );
    }
    if (cred.expiresAt && cred.expiresAt < new Date()) {
      return c.json(
        { error: "client credential has expired", requestId: c.get("requestId") },
        401,
      );
    }

    // Place org context for downstream handlers
    c.set("session", {
      activeOrganizationId: cred.organizationId,
    } as NonNullable<typeof c.var.session>);
    c.set("user", null);
    c.set("authMethod", "client-credential");

    return next();
  },
);
