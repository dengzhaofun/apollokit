/**
 * Admin-facing HTTP routes for the activity module.
 *
 * Player-facing (client-credential) routes are deferred — for MVP the
 * player ops (`join`, `addPoints`, aggregated view)
 * live here under admin auth so games can proxy through their own
 * backend. When client-routes lands the same service methods are
 * re-exposed behind `requireClientCredential`.
 */

import { z } from "@hono/zod-openapi";
import { PaginationQuerySchema, pageOf } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import type {
  ActivityConfig,
  ActivityMemberRow,
  ActivityMembershipConfig,
} from "../../schema/activity";
import type { ActivityMemberStatus } from "./types";
import { activityService } from "./index";
import {
  ActivityConfigResponseSchema,
  AddPointsBody,
  CreateActivitySchema,
  CreateActivityTemplateBody,
  CreateNodeSchema,
  CreateScheduleSchema,
  EndUserIdParam,
  IdParam,
  JoinActivityBody,
  JoinActivityResponseSchema,
  KeyParam,
  LeaveActivityBody,
  MemberListResponseSchema,
  MembersQuerySchema,
  PublishActivitySchema,
  RedeemQueueResponseSchema,
  UpdateActivitySchema,
  UpdateNodeSchema,
} from "./validators";

const TAG = "Activity";

function serializeActivity(row: ActivityConfig) {
  return {
    id: row.id,
    tenantId: row.tenantId,
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
    hiddenAt: row.hiddenAt.toISOString(),
    timezone: row.timezone,
    status: row.status,
    globalRewards: row.globalRewards,
    cleanupRule: row.cleanupRule,
    joinRequirement: row.joinRequirement as Record<string, unknown> | null,
    visibility: row.visibility as "public" | "hidden" | "targeted",
    templateId: row.templateId,
    metadata: row.metadata as Record<string, unknown> | null,
    membership: (row.membership as ActivityMembershipConfig | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMember(row: ActivityMemberRow) {
  return {
    endUserId: row.endUserId,
    status: row.status as ActivityMemberStatus,
    joinedAt: row.joinedAt.toISOString(),
    lastActiveAt: row.lastActiveAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
    queueNumber: row.queueNumber,
    queueNumberUsedAt: row.queueNumberUsedAt
      ? row.queueNumberUsedAt.toISOString()
      : null,
    activityPoints: row.activityPoints,
  };
}

function serializeJoinResult(row: ActivityMemberRow) {
  return {
    id: row.id,
    activityId: row.activityId,
    endUserId: row.endUserId,
    status: row.status as ActivityMemberStatus,
    joinedAt: row.joinedAt.toISOString(),
    lastActiveAt: row.lastActiveAt.toISOString(),
    activityPoints: row.activityPoints,
    queueNumber: row.queueNumber,
    queueNumberUsedAt: row.queueNumberUsedAt
      ? row.queueNumberUsedAt.toISOString()
      : null,
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
  };
}

export const activityRouter = createAdminRouter();

activityRouter.use("*", requireTenantSessionOrApiKey);
activityRouter.use("*", requirePermissionByMethod("activity"));

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
          "application/json": { schema: envelopeOf(ActivityConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await activityService.createActivity(orgId, c.req.valid("json"));
    return c.json(ok(serializeActivity(row)), 201);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List activities",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(pageOf(ActivityConfigResponseSchema)),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await activityService.listActivities(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeActivity), nextCursor: page.nextCursor }),
      200,
    );
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
          "application/json": { schema: envelopeOf(ActivityConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await activityService.getActivity(orgId, key);
    return c.json(ok(serializeActivity(row)), 200);
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
          "application/json": { schema: envelopeOf(ActivityConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await activityService.updateActivity(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeActivity(row)), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}",
    tags: [TAG],
    summary: "Delete an activity",
    request: { params: IdParam },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await activityService.deleteActivity(orgId, id);
    return c.json(ok(null), 200);
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
          "application/json": { schema: envelopeOf(ActivityConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
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
    return c.json(ok(serializeActivity(row)), 200);
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
            schema: envelopeOf(z.record(z.string(), z.unknown()),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await activityService.createNode(orgId, key, c.req.valid("json"));
    return c.json(ok(row), 201);
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
            // `activity` carries the live phase + timeline so the admin UI
            // can render a phase badge per node without a second roundtrip.
            schema: envelopeOf(
              z.object({
                items: z.array(z.record(z.string(), z.unknown())),
                activity: z.object({
                  id: z.string(),
                  alias: z.string(),
                  derivedPhase: z.string(),
                  timeline: z.record(z.string(), z.unknown()),
                }),
              }),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const result = await activityService.listNodes(orgId, key);
    return c.json(ok(result), 200);
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
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await activityService.updateNode(orgId, id, c.req.valid("json"));
    return c.json(ok(row), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/nodes/{id}",
    tags: [TAG],
    summary: "Delete an activity node",
    request: { params: IdParam },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await activityService.deleteNode(orgId, id);
    return c.json(ok(null), 200);
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
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await activityService.createSchedule(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(ok(row), 201);
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
            schema: envelopeOf(z.object({ items: z.array(z.record(z.string(), z.unknown())) }),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const rows = await activityService.listSchedules(orgId, key);
    return c.json(ok({ items: rows }), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/schedules/{id}",
    tags: [TAG],
    summary: "Delete a schedule",
    request: { params: IdParam },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await activityService.deleteSchedule(orgId, id);
    return c.json(ok(null), 200);
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
          "application/json": {
            schema: envelopeOf(JoinActivityResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await activityService.join({
      tenantId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
    });
    return c.json(ok(serializeJoinResult(row)), 200);
  },
);

// ─── Member ops: leave / list / redeem queue ────────────────────

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/leave",
    tags: [TAG],
    summary:
      "Active leave: mark the member as `left` (keeps ledger and queue number).",
    request: {
      params: KeyParam,
      body: { content: { "application/json": { schema: LeaveActivityBody } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(JoinActivityResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await activityService.leaveActivity({
      tenantId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
    });
    return c.json(ok(serializeJoinResult(row)), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{key}/members",
    tags: [TAG],
    summary: "Paginated list of activity members (admin).",
    request: {
      params: KeyParam,
      query: MembersQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(MemberListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const { status, cursor, limit } = c.req.valid("query");
    const result = await activityService.listMembers({
      tenantId: orgId,
      activityIdOrAlias: key,
      status: status ?? "all",
      cursor: cursor ?? null,
      limit: limit ?? 50,
    });
    return c.json(
      ok({
        items: result.items.map(serializeMember),
        nextCursor: result.nextCursor,
      }),
      200,
    );
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{key}/members/{endUserId}/redeem-queue",
    tags: [TAG],
    summary: "Redeem (mark used) a member's queue number. One-shot.",
    request: {
      params: z.object({
        key: z.string().openapi({ param: { name: "key", in: "path" } }),
        endUserId: EndUserIdParam.shape.endUserId,
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(RedeemQueueResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key, endUserId } = c.req.valid("param");
    const result = await activityService.redeemQueueNumber({
      tenantId: orgId,
      activityIdOrAlias: key,
      endUserId,
    });
    return c.json(
      ok({
        endUserId: result.endUserId,
        queueNumber: result.queueNumber,
        usedAt: result.usedAt.toISOString(),
      }),
      200,
    );
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
            schema: envelopeOf(z.object({
              balance: z.number().int(),
            }),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await activityService.addPoints({
      tenantId: orgId,
      activityIdOrAlias: key,
      endUserId: body.endUserId,
      delta: body.delta,
      source: body.source,
      sourceRef: body.sourceRef,
    });
    return c.json(ok(result), 200);
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
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key, endUserId } = c.req.valid("param");
    const view = await activityService.getActivityForUser({
      tenantId: orgId,
      activityIdOrAlias: key,
      endUserId,
    });
    return c.json(ok(view), 200);
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
            schema: envelopeOf(z
              .object({
                advanced: z.number().int(),
                scheduleFired: z.number().int(),
                errors: z.number().int(),
              })
              .openapi("ActivityTickResult"),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const result = await activityService.tickDue({});
    return c.json(ok(result), 200);
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
            schema: envelopeOf(z
              .object({
                participants: z.number().int(),
                completed: z.number().int(),
                dropped: z.number().int(),
                avgPoints: z.number(),
                maxPoints: z.number(),
                p50Points: z.number(),
                pointsBuckets: z.array(
                  z.object({
                    bucket: z.string(),
                    count: z.number().int(),
                  }),
                ),
              })
              .openapi("ActivityAnalytics"),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const result = await activityService.getActivityAnalytics({
      tenantId: orgId,
      activityIdOrAlias: key,
    });
    return c.json(ok(result), 200);
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
          "application/json": { schema: envelopeOf(z.record(z.string(), z.unknown())) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const row = await activityService.createTemplate(orgId, body);
    return c.json(ok(row), 201);
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
            schema: envelopeOf(z.object({
              items: z.array(z.record(z.string(), z.unknown())),
            }),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await activityService.listTemplates(orgId);
    return c.json(ok({ items: rows }), 200);
  },
);

activityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/templates/{id}",
    tags: [TAG],
    summary: "Delete an activity template.",
    request: { params: IdParam },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await activityService.deleteTemplate(orgId, id);
    return c.json(ok(null), 200);
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
            schema: envelopeOf(z
              .object({
                activityAlias: z.string(),
                activityId: z.string(),
              })
              .openapi("ActivityInstantiateResult"),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const result = await activityService.instantiateTemplate({
      tenantId: orgId,
      templateId: id,
    });
    return c.json(ok(result), 200);
  },
);

