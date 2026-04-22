/**
 * Coarse-grained role gate for admin business routes.
 *
 * Better Auth's organization plugin already enforces the default
 * owner/admin/member permission matrix on `/api/auth/organization/*`
 * (invite-member, remove-member, update-member-role, ...). But our
 * business modules (check-in, cdkey, shop, ...) only know how to
 * refuse requests via `requireAuth` / `requireAdminOrApiKey`, which
 * check *whether* a session has an active org — not *what role* the
 * user holds inside it. Without this middleware, a `member` role can
 * call any POST/PUT/DELETE on any business route.
 *
 * Rule:
 *   - Read-only verbs (GET, HEAD) → always allowed.
 *   - Any mutating verb (POST/PUT/PATCH/DELETE) → only owner/admin.
 *
 * This is Phase 1 — a deliberate placeholder. Phase 2 will replace it
 * with a `requirePermission(resource, action)` middleware backed by
 * Better Auth's `createAccessControl` + custom statements, which can
 * express per-module permissions ("operator can generate cdkeys but
 * not edit shop"). The coarse gate lives alongside the existing
 * auth middleware and is a one-line swap at each mount site.
 *
 * Behaviour when the middleware runs WITHOUT a session (e.g. behind an
 * admin API key or when `requireAdminOrApiKey` hasn't run first): we
 * skip the member-role lookup — API keys are already scoped to a
 * specific organization and are considered trusted-operator credentials.
 * Those callers never show up in the `member` table, so enforcing a
 * role against them would always 403.
 */

import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import type { HonoEnv } from "../env";
import { fail } from "../lib/response";
import { member } from "../schema";

const FORBIDDEN_CODE = "forbidden";

export const requireOrgManage = createMiddleware<HonoEnv>(async (c, next) => {
  // Read-only verbs never require write permission.
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  // Non-session auth (admin API key) → pass through. `requireAdminOrApiKey`
  // has already verified the key maps to this org; we don't second-guess it.
  if (c.var.authMethod === "admin-api-key") {
    return next();
  }

  // Session-authenticated requests: look up this user's role in the
  // active org and refuse write operations for `member`.
  const userId = c.var.user?.id;
  const orgId = c.var.session?.activeOrganizationId;
  if (!userId || !orgId) {
    // Should not happen — `requireAuth` / `requireAdminOrApiKey` run
    // first and establish both. Fail closed rather than open.
    return c.json(
      fail(FORBIDDEN_CODE, "Role check requires an authenticated session."),
      403,
    );
  }

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1);

  if (!row || row.role === "member") {
    return c.json(
      fail(
        FORBIDDEN_CODE,
        "Your role does not have write permission in this organization.",
      ),
      403,
    );
  }

  await next();
});
