import { createMiddleware } from "hono/factory";

import type { HonoEnv } from "../env";
import { NoActiveProjectError, UnauthorizedError } from "./auth-errors";

/**
 * Guard for admin-side business routes.
 *
 * - 401 if there is no authenticated Better Auth user on the context.
 * - 400 if the session has no active project (every business action is
 *   project-scoped via `activeTeamId`, so we refuse to proceed without
 *   knowing which project).
 *
 * Mount per-router, not globally, so future public (API-key) routes can
 * stay unprotected by this middleware. Throws `ModuleError` subclasses so
 * the router/global `onError` emits the standard envelope.
 */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  if (!c.var.user) throw new UnauthorizedError();
  if (!c.var.session?.activeTeamId) throw new NoActiveProjectError();
  await next();
});
