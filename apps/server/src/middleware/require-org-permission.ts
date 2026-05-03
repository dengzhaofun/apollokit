/**
 * Org-level permission gate — for billing / orgMember invite-remove /
 * project create-delete actions in Better Auth's organization plugin.
 *
 * Reads `member.role` (NOT `teamMember.role`) — the org-level role
 * that a user has within a company. See `auth/ac.ts` for the matrix:
 *
 *   orgOwner  — full company control + manage billing + create/delete projects
 *   orgAdmin  — invite/remove org members + create/update projects, read billing
 *   orgViewer — read billing + company metadata only
 *
 * Companion to `require-permission.ts` (team-level / project-scoped).
 * Use `requireOrgPermission` for routes that act on the company itself
 * (e.g. /api/org/billing, /api/org/members) — NOT for routes that
 * scope into a single project.
 *
 * Short-circuits on `admin-api-key` auth: api keys are project-scoped
 * (via metadata.teamId), so they never have "org-level" authority.
 * Org-level routes invoked with an api key are denied (403) by default.
 */

import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { type ResourceName } from "../auth/ac";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { fail } from "../lib/response";
import { member } from "../schema";
import { roleHasPermission } from "./require-permission";

const FORBIDDEN_CODE = "forbidden";

async function getOrgMemberRole(
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
 * Build a Hono middleware that 403s when the current user's org-level
 * role does not grant `<resource>:<action>` in the active organization.
 *
 * Org-level resources are: `billing`, `orgMember`, `team` (project
 * create/delete/update via Better Auth defaults), plus the spread
 * Better Auth `organization` / `member` / `invitation` resources.
 */
export function requireOrgPermission(resource: ResourceName, action: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.authMethod === "admin-api-key") {
      // Admin API keys are project-scoped, not org-scoped. Org-level
      // operations (billing, org-member mgmt, project create/delete)
      // are denied for api-key callers.
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Org-level operations require a session, not an api key.",
        ),
        403,
      );
    }

    const userId = c.var.user?.id;
    const organizationId = c.var.session?.activeOrganizationId;
    if (!userId || !organizationId) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Permission check requires an authenticated session with an active organization.",
        ),
        403,
      );
    }

    const roleString = await getOrgMemberRole(userId, organizationId);
    if (!roleHasPermission(roleString, resource, action)) {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          `Your org-level role does not grant ${resource}:${action}.`,
        ),
        403,
      );
    }

    await next();
  });
}
