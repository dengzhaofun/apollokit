/**
 * C-end client routes for the activity module.
 *
 * Mounted at /api/client/activity. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no auth fields in body or query.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { activityService } from "./index";
import {
  ActivityConfigResponseSchema,
  ClaimMilestoneClientBody,
  } from "./validators";

const TAG = "Activity (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

export const activityClientRouter = createClientRouter();

activityClientRouter.use("*", requireClientCredential);
activityClientRouter.use("*", requireClientUser);

const AliasParam = z.object({
  alias: z.string().min(1).openapi({ param: { name: "alias", in: "path" } }),
});

// ─── List currently visible activities ─────────────────────────

activityClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/list",
    tags: [TAG],
    summary:
      "List activities currently visible to the caller (teasing / active / settling / ended).",
    request: { headers: authHeaders },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(z.object({
              items: z.array(ActivityConfigResponseSchema),
            }),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const now = new Date();
    // Client view fetches a single high-cap page — players don't paginate
    // the activity list, the server is expected to return the visible set
    // in one shot. If a tenant ever has > 200 *active* activities for a
    // single end-user, this should be revisited.
    const { items: rows } = await activityService.listActivities(orgId, { limit: 200 });
    // Only return things the player can see — anything past visible_at
    // and before hidden_at, and not draft.
    const visible = rows.filter(
      (r) =>
        r.status !== "draft" &&
        r.visibility !== "hidden" &&
        r.visibleAt.getTime() <= now.getTime() &&
        r.hiddenAt.getTime() > now.getTime(),
    );
    return c.json(ok({
        items: visible.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          alias: r.alias,
          name: r.name,
          description: r.description,
          bannerImage: r.bannerImage,
          themeColor: r.themeColor,
          kind: r.kind as
            | "generic"
            | "check_in_only"
            | "board_game"
            | "gacha"
            | "season_pass"
            | "custom",
          visibleAt: r.visibleAt.toISOString(),
          startAt: r.startAt.toISOString(),
          endAt: r.endAt.toISOString(),
          rewardEndAt: r.rewardEndAt.toISOString(),
          hiddenAt: r.hiddenAt.toISOString(),
          timezone: r.timezone,
          status: r.status,
          currency: r.currency,
          milestoneTiers: r.milestoneTiers,
          globalRewards: r.globalRewards,
          kindMetadata: r.kindMetadata as Record<string, unknown> | null,
          cleanupRule: r.cleanupRule,
          joinRequirement: r.joinRequirement as Record<string, unknown> | null,
          visibility: r.visibility as "public" | "hidden" | "targeted",
          templateId: r.templateId,
          metadata: r.metadata as Record<string, unknown> | null,
          membership: r.membership,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      }), 200,);
  },
);

// ─── Aggregated view for a player ──────────────────────────────

activityClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/{alias}",
    tags: [TAG],
    summary: "Single-round-trip view of an activity for the caller.",
    request: { headers: authHeaders, params: AliasParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    const view = await activityService.getActivityForUser({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
    });
    return c.json(ok(view), 200);
  },
);

// ─── Join ─────────────────────────────────────────────────────

activityClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/{alias}/join",
    tags: [TAG],
    summary: "Enrol in an activity.",
    request: {
      headers: authHeaders,
      params: AliasParam,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    const row = await activityService.join({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
    });
    return c.json(ok(row), 200);
  },
);

// ─── Claim milestone ──────────────────────────────────────────

activityClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/{alias}/claim-milestone",
    tags: [TAG],
    summary: "Claim an activity milestone reward.",
    request: {
      headers: authHeaders,
      params: AliasParam,
      body: {
        content: {
          "application/json": { schema: ClaimMilestoneClientBody },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { milestoneAlias } = c.req.valid("json");
    const { alias } = c.req.valid("param");
    const result = await activityService.claimMilestone({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
      milestoneAlias,
    });
    return c.json(ok(result), 200);
  },
);
