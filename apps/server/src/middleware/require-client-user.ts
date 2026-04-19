/**
 * Middleware for C-end client routes where the caller represents a specific
 * end user.
 *
 * Reads `x-end-user-id` + `x-user-hash` headers, verifies the HMAC via
 * `clientCredentialService.verifyRequest`, and populates `c.var.endUserId` so
 * handlers can stop re-parsing auth themselves.
 *
 * Must be mounted AFTER `requireClientCredential` — depends on
 * `c.var.clientCredential`. Mount per-router:
 *
 *   router.use("*", requireClientCredential);
 *   router.use("*", requireClientUser);
 *
 * Routes that don't need an end-user context (e.g. a future "public tenant
 * settings" read) should mount only `requireClientCredential`.
 */

import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../env";
import { ModuleError } from "../lib/errors";
import { clientCredentialService } from "../modules/client-credentials";

export const requireClientUser = createMiddleware<HonoEnv>(async (c, next) => {
  const cred = c.get("clientCredential");
  if (!cred) {
    return c.json(
      {
        error: "internal: requireClientUser mounted without requireClientCredential",
        requestId: c.get("requestId"),
      },
      500,
    );
  }

  const endUserId = c.req.header("x-end-user-id");
  if (!endUserId || endUserId.length === 0 || endUserId.length > 256) {
    return c.json(
      {
        error: "missing or invalid x-end-user-id header",
        requestId: c.get("requestId"),
      },
      400,
    );
  }

  const userHash = c.req.header("x-user-hash");

  try {
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
  } catch (err) {
    if (err instanceof ModuleError) {
      return c.json(
        {
          error: err.message,
          code: err.code,
          requestId: c.get("requestId"),
        },
        err.httpStatus as ContentfulStatusCode,
      );
    }
    throw err;
  }

  c.set("endUserId", endUserId);
  return next();
});
