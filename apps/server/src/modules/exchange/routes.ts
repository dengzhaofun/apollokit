/**
 * Admin-facing HTTP routes for the exchange module.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { ItemEntry } from "../item/types";
import { ModuleError } from "./errors";
import { exchangeService } from "./index";
import {
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  CreateConfigSchema,
  CreateOptionSchema,
  ErrorResponseSchema,
  ExchangeConfigResponseSchema,
  ExchangeOptionResponseSchema,
  ExchangeResultSchema,
  ExchangeUserStateResponseSchema,
  ExecuteExchangeSchema,
  IdParamSchema,
  KeyParamSchema,
  OptionIdParamSchema,
  OptionListResponseSchema,
  UpdateConfigSchema,
  UpdateOptionSchema,
} from "./validators";

const TAG_CFG = "Exchange Configs";
const TAG_OPT = "Exchange Options";
const TAG_EXEC = "Exchange Execution";

function serializeConfig(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
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
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeOption(row: {
  id: string;
  configId: string;
  organizationId: string;
  name: string;
  description: string | null;
  costItems: ItemEntry[];
  rewardItems: ItemEntry[];
  userLimit: number | null;
  globalLimit: number | null;
  globalCount: number;
  sortOrder: number;
  isActive: boolean;
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
    costItems: row.costItems,
    rewardItems: row.rewardItems,
    userLimit: row.userLimit,
    globalLimit: row.globalLimit,
    globalCount: row.globalCount,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
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

export const exchangeRouter = new OpenAPIHono<HonoEnv>();

exchangeRouter.use("*", requireAdminOrApiKey);

exchangeRouter.onError((err, c) => {
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

// ─── Config routes ────────────────────────────────────────────────

exchangeRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs",
    tags: [TAG_CFG],
    summary: "Create an exchange config (activity)",
    request: {
      body: { content: { "application/json": { schema: CreateConfigSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: ExchangeConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await exchangeService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs",
    tags: [TAG_CFG],
    summary: "List exchange configs",
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
    const rows = await exchangeService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG_CFG],
    summary: "Get an exchange config by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await exchangeService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Update an exchange config",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: UpdateConfigSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeConfigResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await exchangeService.updateConfig(orgId, id, c.req.valid("json"));
    return c.json(serializeConfig(row), 200);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Delete an exchange config (cascades to options)",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await exchangeService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Option routes ────────────────────────────────────────────────

exchangeRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs/{configKey}/options",
    tags: [TAG_OPT],
    summary: "Create an exchange option under a config",
    request: {
      params: ConfigKeyParamSchema,
      body: { content: { "application/json": { schema: CreateOptionSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: ExchangeOptionResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { configKey } = c.req.valid("param");
    const row = await exchangeService.createOption(
      orgId,
      configKey,
      c.req.valid("json"),
    );
    return c.json(serializeOption(row), 201);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{configKey}/options",
    tags: [TAG_OPT],
    summary: "List exchange options for a config",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: OptionListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { configKey } = c.req.valid("param");
    const rows = await exchangeService.listOptions(orgId, configKey);
    return c.json({ items: rows.map(serializeOption) }, 200);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "patch",
    path: "/options/{optionId}",
    tags: [TAG_OPT],
    summary: "Update an exchange option",
    request: {
      params: OptionIdParamSchema,
      body: { content: { "application/json": { schema: UpdateOptionSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeOptionResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { optionId } = c.req.valid("param");
    const row = await exchangeService.updateOption(
      orgId,
      optionId,
      c.req.valid("json"),
    );
    return c.json(serializeOption(row), 200);
  },
);

exchangeRouter.openapi(
  createRoute({
    method: "delete",
    path: "/options/{optionId}",
    tags: [TAG_OPT],
    summary: "Delete an exchange option",
    request: { params: OptionIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { optionId } = c.req.valid("param");
    await exchangeService.deleteOption(orgId, optionId);
    return c.body(null, 204);
  },
);

// ─── Exchange execution ───────────────────────────────────────────

exchangeRouter.openapi(
  createRoute({
    method: "post",
    path: "/options/{optionId}/execute",
    tags: [TAG_EXEC],
    summary: "Execute an exchange for an end user",
    request: {
      params: OptionIdParamSchema,
      body: { content: { "application/json": { schema: ExecuteExchangeSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { optionId } = c.req.valid("param");
    const { endUserId, idempotencyKey } = c.req.valid("json");
    const result = await exchangeService.execute({
      organizationId: orgId,
      endUserId,
      optionId,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);

// GET user exchange state for an option
exchangeRouter.openapi(
  createRoute({
    method: "get",
    path: "/options/{optionId}/users/{endUserId}/state",
    tags: [TAG_EXEC],
    summary: "Get a user's exchange count for an option",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeUserStateResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const optionId = c.req.param("optionId")!;
    const endUserId = c.req.param("endUserId")!;
    const state = await exchangeService.getUserOptionState({
      organizationId: orgId,
      endUserId,
      optionId,
    });
    return c.json(state, 200);
  },
);
