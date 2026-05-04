/**
 * Guard for the platform-operator surface (`/api/v1/platform/*`).
 *
 * Distinct concept from `requireTenantSessionOrApiKey` (the per-tenant
 * gate): this checks the **platform-level** `user.role` column added by
 * Better Auth's admin plugin. Apollo Kit staff get `role = 'admin'` via
 * SQL bootstrap; ordinary tenants stay at the default `role = 'user'`.
 *
 * Mount per-router on every platform-only route. Do NOT accept admin
 * API keys here — long-lived ak_ keys are tenant-scoped and shouldn't
 * grant cross-tenant visibility. Platform staff act through their
 * session cookie only; if they need scripted access we'll add a
 * separate platform-key concept later.
 */

import { createMiddleware } from "hono/factory";

import type { HonoEnv } from "../env";
import { ModuleError } from "../lib/errors";
import { UnauthorizedError } from "./auth-errors";

/**
 * Roles considered platform admins. Keep in sync with the
 * `adminRoles` array passed to `admin()` in `src/auth.ts` — they
 * resolve the same logical question, just at different layers.
 */
const PLATFORM_ADMIN_ROLES = new Set(["admin"]);

class PlatformForbiddenError extends ModuleError {
  constructor() {
    super(
      "platform.forbidden",
      403,
      "Platform admin role required for this endpoint.",
    );
    this.name = "PlatformForbiddenError";
  }
}

/**
 * True iff the current request belongs to a platform admin. Exported
 * for non-middleware contexts (e.g. computing `/me/capabilities`'s
 * `isPlatformAdmin` flag).
 */
export function isPlatformAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ADMIN_ROLES.has(role);
}

export const requirePlatformAdmin = createMiddleware<HonoEnv>(
  async (c, next) => {
    const user = c.var.user;
    if (!user) throw new UnauthorizedError();
    const role = (user as { role?: string }).role;
    if (!isPlatformAdmin(role)) throw new PlatformForbiddenError();
    await next();
  },
);
