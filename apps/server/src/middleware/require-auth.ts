import { createMiddleware } from "hono/factory";

import type { HonoEnv } from "../env";

/**
 * Guard for admin-side business routes.
 *
 * - 401 if there is no authenticated Better Auth user on the context.
 * - 400 if the session has no active organization (every business action is
 *   tenant-scoped, so we refuse to proceed without knowing which tenant).
 *
 * Mount per-router, not globally, so future public (API-key) routes can
 * stay unprotected by this middleware.
 */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  if (!c.var.user) {
    return c.json(
      { error: "unauthorized", requestId: c.get("requestId") },
      401,
    );
  }
  if (!c.var.session?.activeOrganizationId) {
    return c.json(
      {
        error: "no active organization",
        requestId: c.get("requestId"),
      },
      400,
    );
  }
  await next();
});
