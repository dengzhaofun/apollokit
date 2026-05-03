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
 * Mount per-router, not globally (one exception: it's mounted on
 * `/api/client/auth/*` in `src/index.ts` so end-user-auth routes can
 * resolve the org). Throws `ModuleError` subclasses so the global
 * `app.onError` emits the standard envelope.
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";

import { db } from "../db";
import type { HonoEnv } from "../env";
import { clientCredentials } from "../schema/client-credential";
import { InvalidClientCredentialError } from "./auth-errors";

export const requireClientCredential = createMiddleware<HonoEnv>(
  async (c, next) => {
    const publishableKey = c.req.header("x-api-key");
    if (!publishableKey || !publishableKey.startsWith("cpk_")) {
      throw new InvalidClientCredentialError(
        "missing or invalid x-api-key header",
      );
    }

    const [cred] = await db
      .select({
        id: clientCredentials.id,
        tenantId: clientCredentials.tenantId,
        publishableKey: clientCredentials.publishableKey,
        enabled: clientCredentials.enabled,
        expiresAt: clientCredentials.expiresAt,
        devMode: clientCredentials.devMode,
      })
      .from(clientCredentials)
      .where(eq(clientCredentials.publishableKey, publishableKey));

    if (!cred) {
      throw new InvalidClientCredentialError("invalid client credential");
    }
    if (!cred.enabled) {
      throw new InvalidClientCredentialError("client credential is disabled");
    }
    if (cred.expiresAt && cred.expiresAt < new Date()) {
      throw new InvalidClientCredentialError("client credential has expired");
    }

    // Place org context for downstream handlers
    c.set("session", {
      activeTeamId: cred.tenantId,
    } as NonNullable<typeof c.var.session>);
    c.set("user", null);
    c.set("authMethod", "client-credential");
    c.set("clientCredential", cred);

    return next();
  },
);
