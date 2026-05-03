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
  roles,
  type ResourceName,
} from "../auth/ac";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { createAdminRouter, createAdminRoute } from "../lib/openapi";
import { commonErrorResponses, envelopeOf, ok } from "../lib/response";
import { requireAdminOrApiKey } from "../middleware/require-admin-or-api-key";
import { member } from "../schema";
import { z } from "@hono/zod-openapi";

const TAG = "Me";

export const meRouter = createAdminRouter();
meRouter.use("*", requireAdminOrApiKey);

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
  })
  .openapi("CapabilityBag");

/**
 * Resolve the active member's role string for the current request.
 * Mirrors `getMemberRole` in `require-permission.ts` — we duplicate
 * the tiny query rather than depend on the middleware in handlers.
 */
async function getActiveRole(
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
    for (const resource of BUSINESS_RESOURCES) {
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
    // admin-api-key bypass: API keys are pre-scoped to an org and
    // implicitly trusted as full-manage. Return the union of all
    // resource:[manage] grants so the SDK / SPA flow still works.
    if (c.var.authMethod === "admin-api-key") {
      const allManage: Record<string, string[]> = {};
      for (const resource of BUSINESS_RESOURCES) {
        allManage[resource] = ["manage"];
      }
      return c.json(ok({ role: null, capabilities: allManage }));
    }

    const userId = c.var.user!.id;
    const orgId = c.var.session!.activeOrganizationId!;
    const roleString = await getActiveRole(userId, orgId);
    return c.json(
      ok({
        role: roleString,
        capabilities: computeCapabilities(roleString),
      }),
    );
  },
);

// Re-export resource name list so the admin SPA's typed capabilities
// helper stays in sync. (Not used at runtime — only the type matters.)
export { BUSINESS_RESOURCES, ac };
export type { ResourceName };
