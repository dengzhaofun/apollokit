/**
 * Admin-facing HTTP routes for the level module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_). All handlers resolve the
 * organization from `c.var.session!.activeOrganizationId!`.
 *
 * Client-facing routes (player progress, clear, claim) live in
 * `client-routes.ts`.
 */

import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import type { RewardEntry } from "../../lib/rewards";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { levelService } from "./index";
import { ModuleError } from "./errors";
import type { StarRewardTier } from "./types";
import {
  ConfigIdParamSchema,
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  ConfigResponseSchema,
  CreateConfigSchema,
  CreateLevelSchema,
  CreateStageSchema,
  ErrorResponseSchema,
  LevelIdParamSchema,
  LevelListResponseSchema,
  LevelResponseSchema,
  StageIdParamSchema,
  StageListResponseSchema,
  StageResponseSchema,
  UpdateConfigSchema,
  UpdateLevelSchema,
  UpdateStageSchema,
} from "./validators";

const TAG = "Level";
const TAG_STAGE = "Level Stages";
const TAG_LEVEL = "Level Levels";

// ─── Serializers ────────────────────────────────────────────────

function serializeConfig(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  coverImage: string | null;
  icon: string | null;
  hasStages: boolean;
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
    coverImage: row.coverImage,
    icon: row.icon,
    hasStages: row.hasStages,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeStage(row: {
  id: string;
  configId: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  unlockRule: unknown;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    configId: row.configId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    unlockRule: row.unlockRule ?? null,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeLevel(row: {
  id: string;
  configId: string;
  stageId: string | null;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  difficulty: string | null;
  maxStars: number;
  unlockRule: unknown;
  clearRewards: unknown;
  starRewards: unknown;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    configId: row.configId,
    stageId: row.stageId,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    difficulty: row.difficulty,
    maxStars: row.maxStars,
    unlockRule: row.unlockRule ?? null,
    clearRewards: (row.clearRewards as RewardEntry[] | null) ?? null,
    starRewards: (row.starRewards as StarRewardTier[] | null) ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Router scaffold ────────────────────────────────────────────

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

export const levelRouter = createAdminRouter();

levelRouter.use("*", requireAdminOrApiKey);

levelRouter.onError((err, c) => {
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

// ─── Configs ────────────────────────────────────────────────────

levelRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List level configs",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ConfigListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await levelService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a level config",
    request: {
      body: { content: { "application/json": { schema: CreateConfigSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: ConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await levelService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a level config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await levelService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update a level config",
    request: {
      params: ConfigIdParamSchema,
      body: { content: { "application/json": { schema: UpdateConfigSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.updateConfig(orgId, id, c.req.valid("json"));
    return c.json(serializeConfig(row), 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete a level config (cascades to stages, levels, user progress)",
    request: { params: ConfigIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await levelService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Stages ─────────────────────────────────────────────────────

levelRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{id}/stages",
    tags: [TAG_STAGE],
    summary: "List stages under a config",
    request: { params: ConfigIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: StageListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const rows = await levelService.listStages(orgId, id);
    return c.json({ items: rows.map(serializeStage) }, 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{id}/stages",
    tags: [TAG_STAGE],
    summary: "Create a stage under a config",
    request: {
      params: ConfigIdParamSchema,
      body: { content: { "application/json": { schema: CreateStageSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: StageResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.createStage(orgId, id, c.req.valid("json"));
    return c.json(serializeStage(row), 201);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/stages/{id}",
    tags: [TAG_STAGE],
    summary: "Update a stage",
    request: {
      params: StageIdParamSchema,
      body: { content: { "application/json": { schema: UpdateStageSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: StageResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.updateStage(orgId, id, c.req.valid("json"));
    return c.json(serializeStage(row), 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/stages/{id}",
    tags: [TAG_STAGE],
    summary: "Delete a stage (levels have their stageId set to null)",
    request: { params: StageIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await levelService.deleteStage(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Levels ─────────────────────────────────────────────────────

const StageIdQuerySchema = z.object({
  stageId: z
    .string()
    .uuid()
    .optional()
    .openapi({
      param: { name: "stageId", in: "query" },
      description: "Filter levels by stage id.",
    }),
});

levelRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{id}/levels",
    tags: [TAG_LEVEL],
    summary: "List levels under a config",
    request: {
      params: ConfigIdParamSchema,
      query: StageIdQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: LevelListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { stageId } = c.req.valid("query");
    const rows = await levelService.listLevels(orgId, id, stageId);
    return c.json({ items: rows.map(serializeLevel) }, 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{id}/levels",
    tags: [TAG_LEVEL],
    summary: "Create a level under a config",
    request: {
      params: ConfigIdParamSchema,
      body: { content: { "application/json": { schema: CreateLevelSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: LevelResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.createLevel(orgId, id, c.req.valid("json"));
    return c.json(serializeLevel(row), 201);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/levels/{id}",
    tags: [TAG_LEVEL],
    summary: "Fetch a level by id",
    request: { params: LevelIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: LevelResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.loadLevelById(orgId, id);
    return c.json(serializeLevel(row), 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/levels/{id}",
    tags: [TAG_LEVEL],
    summary: "Update a level",
    request: {
      params: LevelIdParamSchema,
      body: { content: { "application/json": { schema: UpdateLevelSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: LevelResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await levelService.updateLevel(orgId, id, c.req.valid("json"));
    return c.json(serializeLevel(row), 200);
  },
);

levelRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/levels/{id}",
    tags: [TAG_LEVEL],
    summary: "Delete a level (cascades to user progress)",
    request: { params: LevelIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await levelService.deleteLevel(orgId, id);
    return c.body(null, 204);
  },
);
