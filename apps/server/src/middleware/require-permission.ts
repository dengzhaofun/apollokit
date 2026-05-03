/**
 * Permission gate backed by Better Auth's organization access control.
 *
 * Two flavors:
 *
 *   `requirePermission(resource, action)` — strict. Always enforce
 *      `<resource>:<action>` regardless of HTTP method. Use for
 *      sensitive routes (audit-log, billing, etc.) and for individual
 *      handlers that need a specific verb beyond the per-method default.
 *
 *   `requirePermissionByMethod(resource)` — derives the action from
 *      the request method:
 *        GET / HEAD / OPTIONS → `<resource>:read`
 *        POST / PUT / PATCH / DELETE → `<resource>:write`
 *      Use as the per-router `.use("*", ...)` mount that replaces the
 *      old `requireOrgManage` — preserves the existing semantics
 *      ("read = anyone in the org with read perm; write = operator+")
 *      with the new four-role matrix.
 *
 * Both flavors short-circuit on `admin-api-key` auth — admin API keys
 * are scoped to a single org and treated as trusted-operator credentials,
 * matching how `requireOrgManage` and `requireOrgReadSensitive` worked.
 *
 * The role lookup hits the `member` table directly (not Better Auth's
 * `auth.api.hasPermission`) because:
 *   1. We're inside Hono middleware where `auth.api.hasPermission`
 *      requires forwarding cookies / building a sub-request — heavier
 *      than a single indexed SELECT.
 *   2. We support comma-separated multi-role values (`"operator,viewer"`)
 *      with the union semantics Better Auth gives client-side.
 *   3. `manage` short-circuits any specific verb on the same resource.
 *
 * The actual permission dictionary lives in `../auth/ac.ts`. The
 * middleware imports `roles` so changes to the matrix are picked up
 * automatically.
 */

import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { roles, type ResourceName } from "../auth/ac";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { fail } from "../lib/response";
import { member } from "../schema";

const FORBIDDEN_CODE = "forbidden";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Look up a single member's role string in the active org. Returns
 * `null` when the user has no membership row (which `requireAuth`
 * should have prevented — fail closed if it happens).
 */
async function getMemberRole(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * True iff any of the comma-separated role names in `roleString`
 * grant `action` on `resource`. `manage` on the resource counts as
 * "any action".
 */
export function roleHasPermission(
  roleString: string | null,
  resource: ResourceName,
  action: string,
): boolean {
  if (!roleString) return false;
  const roleNames = roleString
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  for (const name of roleNames) {
    const role = (roles as Record<string, (typeof roles)[keyof typeof roles]>)[
      name
    ];
    if (!role) continue;
    // Better Auth Role exposes `.statements` — the per-resource
    // permission dictionary handed in to `ac.newRole({...})`.
    const granted = (
      role.statements as unknown as Record<string, readonly string[] | undefined>
    )[resource];
    if (!granted) continue;
    if (granted.includes(action)) return true;
    if (granted.includes("manage")) return true;
  }
  return false;
}

/**
 * Build a Hono middleware that 403s when the current user's role
 * does not grant `<resource>:<action>` in the active org.
 */
export function requirePermission(resource: ResourceName, action: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.authMethod === "admin-api-key") {
      return next();
    }

    const userId = c.var.user?.id;
    const orgId = c.var.session?.activeOrganizationId;
    if (!userId || !orgId) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Permission check requires an authenticated session.",
        ),
        403,
      );
    }

    const roleString = await getMemberRole(userId, orgId);
    if (!roleHasPermission(roleString, resource, action)) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          `Your role does not grant ${resource}:${action} in this project.`,
        ),
        403,
      );
    }

    await next();
  });
}

/**
 * Per-router gate that auto-derives the required action from the HTTP
 * method. Replaces the old `requireOrgManage` mount on every business
 * module: read for GET/HEAD/OPTIONS, write for any mutation.
 */
export function requirePermissionByMethod(resource: ResourceName) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.authMethod === "admin-api-key") {
      return next();
    }

    const userId = c.var.user?.id;
    const orgId = c.var.session?.activeOrganizationId;
    if (!userId || !orgId) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Permission check requires an authenticated session.",
        ),
        403,
      );
    }

    const method = c.req.method.toUpperCase();
    const action = READ_ONLY_METHODS.has(method) ? "read" : "write";

    const roleString = await getMemberRole(userId, orgId);
    if (!roleHasPermission(roleString, resource, action)) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          `Your role does not grant ${resource}:${action} in this project.`,
        ),
        403,
      );
    }

    await next();
  });
}
