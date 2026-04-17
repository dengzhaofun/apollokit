/**
 * C-end client routes for the activity module.
 *
 * The admin surface at `/api/activity` already exposes every operation;
 * this file exposes the subset that *end users* trigger directly (list,
 * view, join, claim milestone) protected by client credential + HMAC.
 *
 * Activity state is checked inside the service; these routes are a
 * thin auth + serialization layer.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { ModuleError } from "./errors";
import { activityService } from "./index";
import {
  ActivityConfigResponseSchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Activity (Client)";

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const activityClientRouter = new OpenAPIHono<HonoEnv>();

activityClientRouter.use("*", requireClientCredential);

activityClientRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      { error: err.message, code: err.code, requestId: c.get("requestId") },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

const AliasParam = z.object({
  alias: z.string().min(1).openapi({ param: { name: "alias", in: "path" } }),
});

const ClientViewQuery = z.object({
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .openapi({ param: { name: "endUserId", in: "query" } }),
  userHash: z
    .string()
    .optional()
    .openapi({ param: { name: "userHash", in: "query" } }),
});

const ClientActionBody = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
});

const ClaimMilestoneClientBody = ClientActionBody.extend({
  milestoneAlias: z.string().min(1).max(64),
});

// ─── List currently visible activities ─────────────────────────

activityClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/list",
    tags: [TAG],
    summary:
      "List activities currently visible to the caller (teasing / active / settling / ended).",
    request: { query: ClientViewQuery },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(ActivityConfigResponseSchema),
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );
    const orgId = c.var.session!.activeOrganizationId!;
    const now = new Date();
    const rows = await activityService.listActivities(orgId);
    // Only return things the player can see — anything past visible_at
    // and before hidden_at, and not draft.
    const visible = rows.filter(
      (r) =>
        r.status !== "draft" &&
        r.visibility !== "hidden" &&
        r.visibleAt.getTime() <= now.getTime() &&
        r.hiddenAt.getTime() > now.getTime(),
    );
    return c.json(
      {
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
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      200,
    );
  },
);

// ─── Aggregated view for a player ──────────────────────────────

activityClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/{alias}",
    tags: [TAG],
    summary: "Single-round-trip view of an activity for the caller.",
    request: { params: AliasParam, query: ClientViewQuery },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );
    const { alias } = c.req.valid("param");
    const orgId = c.var.session!.activeOrganizationId!;
    const view = await activityService.getActivityForUser({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
    });
    return c.json(view, 200);
  },
);

// ─── Join ─────────────────────────────────────────────────────

activityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/{alias}/join",
    tags: [TAG],
    summary: "Enrol in an activity.",
    request: {
      params: AliasParam,
      body: { content: { "application/json": { schema: ClientActionBody } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash } = c.req.valid("json");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );
    const { alias } = c.req.valid("param");
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await activityService.join({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
    });
    return c.json(row, 200);
  },
);

// ─── Claim milestone ──────────────────────────────────────────

activityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/{alias}/claim-milestone",
    tags: [TAG],
    summary: "Claim an activity milestone reward.",
    request: {
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
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash, milestoneAlias } = c.req.valid("json");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );
    const { alias } = c.req.valid("param");
    const orgId = c.var.session!.activeOrganizationId!;
    const result = await activityService.claimMilestone({
      organizationId: orgId,
      activityIdOrAlias: alias,
      endUserId,
      milestoneAlias,
    });
    return c.json(result, 200);
  },
);
