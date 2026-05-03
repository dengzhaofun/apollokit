/**
 * Permission gate backed by Better Auth's organization access control.
 *
 * The dual-tenant model (org + team/project) splits the gate into two:
 *
 *   `requirePermission(resource, action)` — **team-level (project)**.
 *     Strict: always enforce `<resource>:<action>` regardless of HTTP
 *     method. Reads `teamMember.role` for the active project. Use for
 *     business-module resources (activity, shop, item, ...) and for any
 *     handler that needs a specific verb beyond the per-method default.
 *
 *   `requirePermissionByMethod(resource)` — **team-level (project)**,
 *     auto-derives action from request method:
 *       GET / HEAD / OPTIONS → `<resource>:read`
 *       POST / PUT / PATCH / DELETE → `<resource>:write`
 *     Use as the per-router `.use("*", ...)` mount.
 *
 * Both team-level flavors short-circuit on `admin-api-key` auth —
 * admin API keys carry a `metadata.teamId` that pins them to one
 * project; the auth middleware translates that into `activeTeamId`
 * upstream, so by the time we get here the apikey is already scoped.
 *
 * The role lookup hits `teamMember` directly (not Better Auth's
 * `auth.api.hasPermission`) because:
 *   1. We're inside Hono middleware where `auth.api.hasPermission`
 *      requires forwarding cookies / building a sub-request — heavier
 *      than a single indexed SELECT.
 *   2. We support comma-separated multi-role values with union semantics.
 *   3. `manage` short-circuits any specific verb on the same resource.
 *
 * For org-level permissions (billing, orgMember invite, project create
 * — see `auth/ac.ts` org-level statements), see `require-org-permission.ts`.
 *
 * The actual permission dictionary lives in `../auth/ac.ts`.
 */

import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { roles, type ResourceName } from "../auth/ac";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { fail } from "../lib/response";
import { teamMember } from "../schema";

const FORBIDDEN_CODE = "forbidden";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Look up a single team member's role string in the active project.
 * Returns `null` when the user has no membership row in this team
 * (which `requireAuth` should have prevented — fail closed if it
 * happens).
 */
async function getTeamMemberRole(
  userId: string,
  teamId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
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
    const teamId = c.var.session?.activeTeamId;
    if (!userId || !teamId) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Permission check requires an authenticated session.",
        ),
        403,
      );
    }

    const roleString = await getTeamMemberRole(userId, teamId);
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
    const teamId = c.var.session?.activeTeamId;
    if (!userId || !teamId) {
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

    const roleString = await getTeamMemberRole(userId, teamId);
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
