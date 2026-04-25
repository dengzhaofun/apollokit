import { createMiddleware } from "hono/factory";

import type { HonoEnv } from "../env";

/**
 * Guard for admin-side business routes.
 *
 * - 401 if there is no authenticated Better Auth user on the context.
 * - 400 if the session has no active project (every business action is
 *   project-scoped, so we refuse to proceed without knowing which project).
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
        error: "no active project",
        requestId: c.get("requestId"),
      },
      400,
    );
  }
  await next();
});
