/**
 * Admin-facing HTTP routes for the activity module.
 *
 * Player-facing (client-credential) routes are deferred — for MVP the
 * player ops (`join`, `addPoints`, `claimMilestone`, aggregated view)
 * live here under admin auth so games can proxy through their own
 * backend. When client-routes lands the same service methods are
 * re-exposed behind `requireClientCredential`.
 */

import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { ActivityConfig } from "../../schema/activity";
import { ModuleError } from "./errors";
import { activityService } from "./index";
import {
  ActivityConfigResponseSchema,
  AddPointsBody,
  ClaimMilestoneBody,
  CreateActivitySchema,
  CreateActivityTemplateBody,
  CreateNodeSchema,
  CreateScheduleSchema,
  CreateWebhookEndpointBody,
  ErrorResponseSchema,
  IdParam,
  JoinActivityBody,
  KeyParam,
  PublishActivitySchema,
  UpdateActivitySchema,
  UpdateNodeSchema,
} from "./validators";

const TAG = "Activity";

function serializeActivity(row: ActivityConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    bannerImage: row.bannerImage,
    themeColor: row.themeColor,
    kind: row.kind as
      | "generic"
      | "check_in_only"
      | "board_game"
      | "gacha"
      | "season_pass"
      | "custom",
    visibleAt: row.visibleAt.toISOString(),
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    rewardEndAt: row.rewardEndAt.toISOString(),
    hiddenAt: row.hiddenAt.toISOString(),
    timezone: row.timezone,
    status: row.status,
    currency: row.currency as {
      alias: string;
      name: string;
      icon?: string | null;
    } | null,
    milestoneTiers: row.milestoneTiers,
    globalRewards: row.globalRewards,
    kindMetadata: row.kindMetadata as Record<string, unknown> | null,
    cleanupRule: row.cleanupRule,
    joinRequirement: row.joinRequirement as Record<string, unknown> | null,
    visibility: row.visibility as "public" | "hidden" | "targeted",
    templateId: row.templateId,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

export const activityRouter = createAdminRouter();

activityRouter.use("*", requireAdminOrApiKey);

activityRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      { error: err.message, code: err.code, requestId: c.get("requestId") },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

// ─── Activity CRUD ──────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/",
    tags: [TAG],
    summary: "Create an activity (draft)",
    request: {
      body: { content: { "application/json": { schema: CreateActivitySchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: ActivityConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await activityService.createActivity(orgId, c.req.valid("json"));
    return c.json(serializeActivity(row), 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List activities",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(ActivityConfigResponseSchema) }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await activityService.listActivities(orgId);
    return c.json({ items: rows.map(serializeActivity) }, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}",
    tags: [TAG],
    summary: "Fetch an activity by id or alias",
    request: { params: KeyParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ActivityConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await activityService.getActivity(orgId, key);
    return c.json(serializeActivity(row), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{id}",
    tags: [TAG],
    summary: "Update an activity",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: UpdateActivitySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ActivityConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await activityService.updateActivity(orgId, id, c.req.valid("json"));
    return c.json(serializeActivity(row), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}",
    tags: [TAG],
    summary: "Delete an activity",
    request: { params: IdParam },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await activityService.deleteActivity(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Lifecycle ──────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/publish",
    tags: [TAG],
    summary: "Publish / unpublish / archive an activity",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: PublishActivitySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ActivityConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const { action } = c.req.valid("json");
    let row;
    if (action === "publish") row = await activityService.publish(orgId, key);
    else if (action === "unpublish")
      row = await activityService.unpublish(orgId, key);
    else {
      // archive — allow ops to force-archive; not common, so we inline.
      const existing = await activityService.getActivity(orgId, key);
      row = await activityService.updateActivity(orgId, existing.id, {});
      // NOTE: MVP does not expose a direct setStatus('archived') path
      // beyond the time-driven cron. Ops can fast-forward by updating
      // hiddenAt to now and calling tick.
    }
    return c.json(serializeActivity(row), 200);
  },
);

// ─── Nodes ──────────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/nodes",
    tags: [TAG],
    summary: "Attach a node to an activity",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: CreateNodeSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: z.record(z.string(), z.unknown()),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await activityService.createNode(orgId, key, c.req.valid("json"));
    return c.json(row, 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}/nodes",
    tags: [TAG],
    summary: "List nodes of an activity",
    request: { params: KeyParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await activityService.listNodes(orgId, key);
    return c.json({ items: rows }, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/nodes/{id}",
    tags: [TAG],
    summary: "Update an activity node",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: UpdateNodeSchema } } },
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await activityService.updateNode(orgId, id, c.req.valid("json"));
    return c.json(row, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/nodes/{id}",
    tags: [TAG],
    summary: "Delete an activity node",
    request: { params: IdParam },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await activityService.deleteNode(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Schedules ──────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/schedules",
    tags: [TAG],
    summary: "Attach a time trigger to an activity",
    request: {
      params: KeyParam,
      body: {
        content: { "application/json": { schema: CreateScheduleSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await activityService.createSchedule(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(row, 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}/schedules",
    tags: [TAG],
    summary: "List schedules attached to an activity",
    request: { params: KeyParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await activityService.listSchedules(orgId, key);
    return c.json({ items: rows }, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/schedules/{id}",
    tags: [TAG],
    summary: "Delete a schedule",
    request: { params: IdParam },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await activityService.deleteSchedule(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Player-facing (proxied through admin auth for MVP) ────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/join",
    tags: [TAG],
    summary: "Enrol an end user in an activity",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: JoinActivityBody } } },
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await activityService.join({
      organizationId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
    });
    return c.json(row, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/add-points",
    tags: [TAG],
    summary: "Adjust activity points for a player",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: AddPointsBody } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({
              balance: z.number().int(),
              unlockedMilestones: z.array(z.string()),
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await activityService.addPoints({
      organizationId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
      delta: body.delta,
      source: body.source,
      sourceRef: body.sourceRef,
    });
    return c.json(result, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/claim-milestone",
    tags: [TAG],
    summary: "Claim an activity milestone reward",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: ClaimMilestoneBody } } },
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await activityService.claimMilestone({
      organizationId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
      milestoneAlias: body.milestoneAlias,
    });
    return c.json(result, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}/view/{endUserId}",
    tags: [TAG],
    summary: "Aggregated view of an activity for a specific player",
    request: {
      params: z.object({
        key: z.string().openapi({ param: { name: "key", in: "path" } }),
        endUserId: z
          .string()
          .openapi({ param: { name: "endUserId", in: "path" } }),
      }),
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { key, endUserId } = c.req.valid("param");
    const view = await activityService.getActivityForUser({
      organizationId: orgId,
      activityIdOrAlias: key,
      endUserId,
    });
    return c.json(view, 200);
  },
);

// ─── Ops ────────────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/tick/run",
    tags: [TAG],
    summary: "Manually run activityService.tickDue (ops backfill).",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z
              .object({
                advanced: z.number().int(),
                scheduleFired: z.number().int(),
                webhooksDelivered: z.number().int(),
                errors: z.number().int(),
              })
              .openapi("ActivityTickResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const result = await activityService.tickDue({});
    return c.json(result, 200);
  },
);

// ─── Webhook endpoints ──────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/webhook-endpoints",
    tags: [TAG],
    summary: "Create a webhook endpoint",
    request: {
      body: {
        content: { "application/json": { schema: CreateWebhookEndpointBody } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await activityService.createWebhookEndpoint(orgId, body);
    return c.json(result, 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/webhook-endpoints",
    tags: [TAG],
    summary: "List webhook endpoints",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(z.record(z.string(), z.unknown())),
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await activityService.listWebhookEndpoints(orgId);
    return c.json({ items: rows }, 200);
  },
);

// ─── Analytics ──────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}/analytics",
    tags: [TAG],
    summary: "Participation stats for an activity.",
    request: { params: KeyParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z
              .object({
                participants: z.number().int(),
                completed: z.number().int(),
                dropped: z.number().int(),
                avgPoints: z.number(),
                maxPoints: z.number(),
                p50Points: z.number(),
                milestoneClaims: z.array(
                  z.object({
                    milestoneAlias: z.string(),
                    count: z.number().int(),
                  }),
                ),
                pointsBuckets: z.array(
                  z.object({
                    bucket: z.string(),
                    count: z.number().int(),
                  }),
                ),
              })
              .openapi("ActivityAnalytics"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const result = await activityService.getActivityAnalytics({
      organizationId: orgId,
      activityIdOrAlias: key,
    });
    return c.json(result, 200);
  },
);

// ─── Templates ──────────────────────────────────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/templates",
    tags: [TAG],
    summary: "Create an activity template (for periodic / recurring activities).",
    request: {
      body: {
        content: { "application/json": { schema: CreateActivityTemplateBody } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: z.record(z.string(), z.unknown()) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const row = await activityService.createTemplate(orgId, body);
    return c.json(row, 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/templates",
    tags: [TAG],
    summary: "List activity templates.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(z.record(z.string(), z.unknown())),
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await activityService.listTemplates(orgId);
    return c.json({ items: rows }, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/templates/{id}",
    tags: [TAG],
    summary: "Delete an activity template.",
    request: { params: IdParam },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await activityService.deleteTemplate(orgId, id);
    return c.body(null, 204);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/templates/{id}/instantiate",
    tags: [TAG],
    summary:
      "Manually spawn a new activity instance from a template (creates in draft status).",
    request: { params: IdParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z
              .object({
                activityAlias: z.string(),
                activityId: z.string(),
              })
              .openapi("ActivityInstantiateResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const result = await activityService.instantiateTemplate({
      organizationId: orgId,
      templateId: id,
    });
    return c.json(result, 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/webhook-endpoints/{id}",
    tags: [TAG],
    summary: "Delete a webhook endpoint",
    request: { params: IdParam },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await activityService.deleteWebhookEndpoint(orgId, id);
    return c.body(null, 204);
  },
);
