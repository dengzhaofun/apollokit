/**
 * Admin-facing HTTP routes for the task module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_).
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import type { TaskNavigation } from "../../schema/task";
import { taskService } from "./index";
import { ModuleError } from "./errors";
import {
  CategoryIdParamSchema,
  CategoryListResponseSchema,
  CategoryResponseSchema,
  CreateCategorySchema,
  CreateDefinitionSchema,
  DefinitionKeyParamSchema,
  DefinitionListResponseSchema,
  DefinitionResponseSchema,
  ErrorResponseSchema,
  UpdateCategorySchema,
  UpdateDefinitionSchema,
} from "./validators";

const TAG_CAT = "Task Categories";
const TAG_DEF = "Task Definitions";

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
  targetValue: number;
  parentProgressValue: number;
  prerequisiteTaskIds: string[];
  rewards: RewardEntry[];
  autoClaim: boolean;
  navigation: TaskNavigation | null;
  isActive: boolean;
  isHidden: boolean;
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
    targetValue: row.targetValue,
    parentProgressValue: row.parentProgressValue,
    prerequisiteTaskIds: row.prerequisiteTaskIds,
    rewards: row.rewards,
    autoClaim: row.autoClaim,
    navigation: row.navigation,
    isActive: row.isActive,
    isHidden: row.isHidden,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Router ─────────────────────────────────────────────────────

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

export const taskRouter = new OpenAPIHono<HonoEnv>();

taskRouter.use("*", requireAdminOrApiKey);

taskRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

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
        content: { "application/json": { schema: CategoryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await taskService.createCategory(orgId, c.req.valid("json"));
    return c.json(serializeCategory(row), 201);
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
          "application/json": { schema: CategoryListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await taskService.listCategories(orgId);
    return c.json({ items: rows.map(serializeCategory) }, 200);
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
        content: { "application/json": { schema: CategoryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await taskService.getCategory(orgId, id);
    return c.json(serializeCategory(row), 200);
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
        content: { "application/json": { schema: CategoryResponseSchema } },
      },
      ...errorResponses,
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
    return c.json(serializeCategory(row), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "delete",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Delete a task category",
    request: { params: CategoryIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await taskService.deleteCategory(orgId, id);
    return c.body(null, 204);
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
          "application/json": { schema: DefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await taskService.createDefinition(
      orgId,
      c.req.valid("json"),
    );
    return c.json(serializeDefinition(row), 201);
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
          "application/json": { schema: DefinitionListResponseSchema },
        },
      },
      ...errorResponses,
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
    return c.json({ items: rows.map(serializeDefinition) }, 200);
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
          "application/json": { schema: DefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await taskService.getDefinition(orgId, key);
    return c.json(serializeDefinition(row), 200);
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
          "application/json": { schema: DefinitionResponseSchema },
        },
      },
      ...errorResponses,
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
    return c.json(serializeDefinition(row), 200);
  },
);

taskRouter.openapi(
  createRoute({
    method: "delete",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Delete a task definition (cascades to progress)",
    request: { params: DefinitionKeyParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    await taskService.deleteDefinition(orgId, key);
    return c.body(null, 204);
  },
);
