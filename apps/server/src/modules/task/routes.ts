/**
 * Admin-facing HTTP routes for the task module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_).
 */

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import type { TaskNavigation, TaskRewardTier } from "../../schema/task";
import { taskService } from "./index";
import type { TaskUserAssignment } from "./types";
import {
  AssignBatchResponseSchema,
  AssignmentListResponseSchema,
  AssignTaskBodySchema,
  CategoryIdParamSchema,
  CategoryListResponseSchema,
  CategoryResponseSchema,
  CreateCategorySchema,
  CreateDefinitionSchema,
  DefinitionKeyParamSchema,
  DefinitionListResponseSchema,
  DefinitionResponseSchema,
  ListAssignmentsQuerySchema,
  RevokeAssignmentParamsSchema,
  UpdateCategorySchema,
  UpdateDefinitionSchema,
} from "./validators";

const TAG_CAT = "Task Categories";
const TAG_DEF = "Task Definitions";
const TAG_ASSIGN = "Task Assignments";

// ─── Serializers ─────────────────────────────────────────────────

function serializeCategory(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  scope: string;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    scope: row.scope,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDefinition(row: {
  id: string;
  organizationId: string;
  categoryId: string | null;
  parentId: string | null;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  period: string;
  timezone: string;
  weekStartsOn: number;
  countingMethod: string;
  eventName: string | null;
  eventValueField: string | null;
  filter: string | null;
  targetValue: number;
  parentProgressValue: number;
  prerequisiteTaskIds: string[];
  rewards: RewardEntry[];
  rewardTiers: TaskRewardTier[];
  autoClaim: boolean;
  navigation: TaskNavigation | null;
  isActive: boolean;
  isHidden: boolean;
  visibility: string;
  defaultAssignmentTtlSeconds: number | null;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    parentId: row.parentId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    period: row.period,
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn,
    countingMethod: row.countingMethod,
    eventName: row.eventName,
    eventValueField: row.eventValueField,
    filter: row.filter,
    targetValue: row.targetValue,
    parentProgressValue: row.parentProgressValue,
    prerequisiteTaskIds: row.prerequisiteTaskIds,
    rewards: row.rewards,
    rewardTiers: row.rewardTiers ?? [],
    autoClaim: row.autoClaim,
    navigation: row.navigation,
    isActive: row.isActive,
    isHidden: row.isHidden,
    visibility: row.visibility,
    defaultAssignmentTtlSeconds: row.defaultAssignmentTtlSeconds,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Router ─────────────────────────────────────────────────────

export const taskRouter = makeApiRouter();

taskRouter.use("*", requireAdminOrApiKey);

// ─── Categories ─────────────────────────────────────────────────

taskRouter.openapi(
  createRoute({
    method: "post",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "Create a task category",
    request: {
      body: {
        content: { "application/json": { schema: CreateCategorySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(CategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await taskService.createCategory(orgId, c.req.valid("json"));
    return c.json(ok(serializeCategory(row)), 201);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "List task categories",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CategoryListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await taskService.listCategories(orgId);
    return c.json(ok({ items: rows.map(serializeCategory) }), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Get a task category",
    request: { params: CategoryIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await taskService.getCategory(orgId, id);
    return c.json(ok(serializeCategory(row)), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "patch",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Update a task category",
    request: {
      params: CategoryIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateCategorySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await taskService.updateCategory(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeCategory(row)), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "delete",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Delete a task category",
    request: { params: CategoryIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await taskService.deleteCategory(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Definitions ────────────────────────────────────────────────

taskRouter.openapi(
  createRoute({
    method: "post",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "Create a task definition",
    request: {
      body: {
        content: { "application/json": { schema: CreateDefinitionSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(DefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await taskService.createDefinition(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeDefinition(row)), 201);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "List task definitions",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DefinitionListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const categoryId = c.req.query("categoryId") ?? undefined;
    const period = c.req.query("period") ?? undefined;
    const parentId = c.req.query("parentId");
    const activityId = c.req.query("activityId") ?? undefined;
    const includeActivity = c.req.query("includeActivity") === "true";
    const rows = await taskService.listDefinitions(orgId, {
      categoryId,
      period,
      parentId: parentId === undefined ? undefined : parentId === "null" ? null : parentId,
      activityId,
      includeActivity,
    });
    return c.json(ok({ items: rows.map(serializeDefinition) }), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Get a task definition by id or alias",
    request: { params: DefinitionKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await taskService.getDefinition(orgId, key);
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "patch",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Update a task definition",
    request: {
      params: DefinitionKeyParamSchema,
      body: {
        content: { "application/json": { schema: UpdateDefinitionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await taskService.updateDefinition(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "delete",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Delete a task definition (cascades to progress)",
    request: { params: DefinitionKeyParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    await taskService.deleteDefinition(orgId, key);
    return c.json(ok(null), 200);
  },
);

// ─── Assignments (定向分配) ─────────────────────────────────────

function serializeAssignment(row: TaskUserAssignment) {
  return {
    taskId: row.taskId,
    endUserId: row.endUserId,
    organizationId: row.organizationId,
    assignedAt: row.assignedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    source: row.source,
    sourceRef: row.sourceRef,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

taskRouter.openapi(
  createRoute({
    method: "post",
    path: "/definitions/{key}/assignments",
    tags: [TAG_ASSIGN],
    summary: "Assign a task to one or more end users",
    request: {
      params: DefinitionKeyParamSchema,
      body: {
        content: { "application/json": { schema: AssignTaskBodySchema } },
      },
    },
    responses: {
      201: {
        description: "Assigned",
        content: {
          "application/json": { schema: envelopeOf(AssignBatchResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await taskService.assignTaskToUsers(
      orgId,
      key,
      body.endUserIds,
      {
        source: body.source,
        sourceRef: body.sourceRef ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        ttlSeconds: body.ttlSeconds,
        metadata: body.metadata ?? null,
        allowReassign: body.allowReassign,
      },
    );

    return c.json(
      ok({
        assigned: result.assigned,
        skipped: result.skipped,
        items: result.items.map(serializeAssignment),
      }),
      201,
    );
  },
);

taskRouter.openapi(
  createRoute({
    method: "delete",
    path: "/definitions/{key}/assignments/{endUserId}",
    tags: [TAG_ASSIGN],
    summary: "Revoke a task assignment for a single end user",
    request: { params: RevokeAssignmentParamsSchema },
    responses: {
      200: {
        description: "Revoked",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key, endUserId } = c.req.valid("param");
    await taskService.revokeAssignment(orgId, endUserId, key);
    return c.json(ok(null), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/definitions/{key}/assignments",
    tags: [TAG_ASSIGN],
    summary: "List end users assigned to this task",
    request: {
      params: DefinitionKeyParamSchema,
      query: ListAssignmentsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssignmentListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const { endUserId, activeOnly, limit } = c.req.valid("query");
    const def = await taskService.getDefinition(orgId, key);
    const rows = await taskService.listAssignments(
      orgId,
      {
        taskId: def.id,
        endUserId,
        activeOnly: activeOnly === undefined ? true : activeOnly === "true",
      },
      { limit },
    );
    return c.json(ok({ items: rows.map(serializeAssignment) }), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "get",
    path: "/assignments",
    tags: [TAG_ASSIGN],
    summary: "List assignments across all tasks (admin/customer-support view)",
    request: { query: ListAssignmentsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssignmentListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, activeOnly, limit } = c.req.valid("query");
    const rows = await taskService.listAssignments(
      orgId,
      {
        endUserId,
        activeOnly: activeOnly === undefined ? true : activeOnly === "true",
      },
      { limit },
    );
    return c.json(ok({ items: rows.map(serializeAssignment) }), 200);
  },
);
