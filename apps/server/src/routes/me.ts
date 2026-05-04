/**
 * `/me/*` — current-user introspection endpoints used by the admin SPA.
 *
 * Right now this only serves `/me/capabilities`, the capability-bag
 * lookup that the admin app fetches once per active-org change to drive
 * `<Can>` / `useCan()` rendering.
 *
 * The bag is computed in-process from `auth/ac.ts` instead of going
 * through Better Auth's `hasPermission` API for two reasons:
 *
 *   1. We need the full set, not a yes/no per resource — sending one
 *      RPC per `(resource, action)` would be 100+ requests at page load.
 *   2. The ac matrix is the single source of truth either way; Better
 *      Auth's `hasPermission` reads from the same `roles` we register.
 */

import { eq, and } from "drizzle-orm";

import {
  ac,
  BUSINESS_RESOURCES,
  ORG_RESOURCES,
  roles,
  type ResourceName,
} from "../auth/ac";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { createAdminRouter, createAdminRoute } from "../lib/openapi";
import { commonErrorResponses, envelopeOf, ok } from "../lib/response";
import { requireTenantSessionOrApiKey } from "../middleware/require-tenant-session-or-api-key";
import { isPlatformAdmin } from "../middleware/require-platform-admin";
import { member, teamMember } from "../schema";
import { z } from "@hono/zod-openapi";

// Better Auth's defaultStatements gives ownerAc/adminAc/memberAc the
// `organization` / `member` / `invitation` / `team` resource set. The
// RouteGuard / <Can /> on /settings/* checks for `organization:update`
// etc., so we expose those alongside our own `billing` / `orgMember`
// extension under ORG_RESOURCES.
const ORG_LEVEL_KEYS = [
  "organization",
  "invitation",
  "team",
  "member",
  ...ORG_RESOURCES,
] as readonly string[];

const TAG = "Me";

export const meRouter = createAdminRouter();
meRouter.use("*", requireTenantSessionOrApiKey);

const CapabilityBagSchema = z
  .object({
    role: z.string().nullable().openapi({
      description:
        "Comma-separated role string from member.role, or null for non-session auth (admin API key).",
      example: "admin",
    }),
    capabilities: z
      .record(z.string(), z.array(z.string()))
      .openapi({
        description:
          "Map of resource name → array of granted action names (excluding 'manage' which is implicit when present).",
        example: { activity: ["read", "write"], cdkey: ["read"] },
      }),
    isPlatformAdmin: z.boolean().openapi({
      description:
        "True iff the current user has the platform-level `admin` role (Better Auth admin plugin's user.role). Drives visibility of the /admin/* surface in the SPA.",
    }),
  })
  .openapi("CapabilityBag");

/**
 * Resolve the active team member's role string for the current request.
 * Mirrors `getTeamMemberRole` in `require-permission.ts` — we duplicate
 * the tiny query rather than depend on the middleware in handlers.
 *
 * In the dual-tenant model, capabilities are scoped to the active
 * project (Better Auth team), so we look at `teamMember.role` not
 * `member.role`.
 */
async function getActiveRole(
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

/** Org-level role from `member.role`, used for `<Can resource="organization">` etc. */
async function getActiveOrgRole(
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
 * Compute the capability bag for a role string. Comma-separated multi-
 * roles take the union; unknown role names are silently skipped.
 *
 * `manage` is preserved in the action list — the client side checks
 * for it the same way the server does.
 */
function computeCapabilities(
  roleString: string | null,
  resourceList: readonly string[],
): Record<string, string[]> {
  const bag: Record<string, Set<string>> = {};
  if (!roleString) return {};

  const roleNames = roleString
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  for (const name of roleNames) {
    const role = (
      roles as unknown as Record<
        string,
        { statements: Record<string, readonly string[]> }
      >
    )[name];
    if (!role) continue;
    for (const resource of resourceList) {
      const granted = role.statements[resource];
      if (!granted || granted.length === 0) continue;
      if (!bag[resource]) bag[resource] = new Set();
      for (const action of granted) bag[resource].add(action);
    }
  }

  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(bag)) {
    out[resource] = Array.from(actions).sort();
  }
  return out;
}

meRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/capabilities",
    tags: [TAG],
    summary: "Capability bag for the current user in the active organization",
    description:
      "Returns the full set of (resource, action[]) the current user can perform. Used by the admin SPA to drive button enable/disable and menu visibility.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(CapabilityBagSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    // admin-api-key bypass: API keys are pre-scoped to a project and
    // implicitly trusted as full-manage. Return the union of all
    // resource:[manage] grants so the SDK / SPA flow still works.
    // API keys are tenant-scoped, so isPlatformAdmin is always false
    // on this path — platform staff use a session cookie, not a key.
    if (c.var.authMethod === "admin-api-key") {
      const allManage: Record<string, string[]> = {};
      for (const resource of BUSINESS_RESOURCES) {
        allManage[resource] = ["manage"];
      }
      return c.json(
        ok({ role: null, capabilities: allManage, isPlatformAdmin: false }),
      );
    }

    const userId = c.var.user!.id;
    const tenantId = c.var.session!.activeTeamId!;
    const orgId = c.var.session!.activeOrganizationId!;

    // Two layers union into one bag — RouteGuard / <Can /> consumers
    // treat the result as flat. Keys never collide across layers
    // (BUSINESS_RESOURCES vs ORG_LEVEL_KEYS are disjoint by construction).
    const teamRoleString = await getActiveRole(userId, tenantId);
    const orgRoleString = await getActiveOrgRole(userId, orgId);
    const teamBag = computeCapabilities(teamRoleString, BUSINESS_RESOURCES);
    const orgBag = computeCapabilities(orgRoleString, ORG_LEVEL_KEYS);
    const platformRole = (c.var.user as { role?: string }).role ?? null;
    return c.json(
      ok({
        // Surface the team-level role (the daily one). Org-level role is
        // already inferable from the org-level capabilities.
        role: teamRoleString,
        capabilities: { ...teamBag, ...orgBag },
        isPlatformAdmin: isPlatformAdmin(platformRole),
      }),
    );
  },
);

// Re-export resource name list so the admin SPA's typed capabilities
// helper stays in sync. (Not used at runtime — only the type matters.)
export { BUSINESS_RESOURCES, ac };
export type { ResourceName };
