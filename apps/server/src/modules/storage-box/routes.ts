/**
 * Admin-facing HTTP routes for the storage-box module.
 *
 * All endpoints are guarded by requireAdminOrApiKey and scoped to the
 * caller's active organization. End-user-initiated deposit/withdraw
 * flows are invoked by the admin (or an API key) on behalf of a given
 * `endUserId`. A public player-facing router is out of scope for MVP
 * (per apps/server/CLAUDE.md — "No public routes yet").
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { ModuleError } from "./errors";
import { storageBoxService } from "./index";
import { projectInterest } from "./interest";
import type {
  StorageBoxConfig,
  StorageBoxDeposit,
  StorageBoxDepositView,
} from "./types";
import {
  ConfigListResponseSchema,
  ConfigResponseSchema,
  CreateConfigSchema,
  DepositListResponseSchema,
  DepositResultSchema,
  DepositSchema,
  EndUserIdParamSchema,
  ErrorResponseSchema,
  IdParamSchema,
  UpdateConfigSchema,
  WithdrawResultSchema,
  WithdrawSchema,
} from "./validators";

const TAG_CFG = "Storage Box Configs";
const TAG_TXN = "Storage Box Transactions";

function serializeConfig(row: StorageBoxConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    type: row.type,
    lockupDays: row.lockupDays,
    interestRateBps: row.interestRateBps,
    interestPeriodDays: row.interestPeriodDays,
    acceptedCurrencyIds: row.acceptedCurrencyIds,
    minDeposit: row.minDeposit,
    maxDeposit: row.maxDeposit,
    allowEarlyWithdraw: row.allowEarlyWithdraw,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDepositView(row: StorageBoxDepositView) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    endUserId: row.endUserId,
    boxConfigId: row.boxConfigId,
    currencyDefinitionId: row.currencyDefinitionId,
    principal: row.principal,
    accruedInterest: row.accruedInterest,
    projectedInterest: row.projectedInterest,
    status: row.status,
    isSingleton: row.isSingleton,
    isMatured: row.isMatured,
    depositedAt: row.depositedAt.toISOString(),
    lastAccrualAt: row.lastAccrualAt.toISOString(),
    maturesAt: row.maturesAt ? row.maturesAt.toISOString() : null,
    withdrawnAt: row.withdrawnAt ? row.withdrawnAt.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Wrap a bare deposit row (no config join) into a view by computing
 * projected interest from the config we already have in scope. Used for
 * deposit / withdraw responses where we didn't JOIN.
 */
function viewFromDepositAndConfig(
  row: StorageBoxDeposit,
  config: Pick<StorageBoxConfig, "interestRateBps" | "interestPeriodDays">,
  now: Date,
): StorageBoxDepositView {
  const extra = projectInterest(
    row.principal,
    config.interestRateBps,
    config.interestPeriodDays,
    row.lastAccrualAt,
    now,
  );
  return {
    ...row,
    projectedInterest: row.accruedInterest + extra,
    isMatured:
      row.maturesAt != null && row.maturesAt.getTime() <= now.getTime(),
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

export const storageBoxRouter = new OpenAPIHono<HonoEnv>();

storageBoxRouter.use("*", requireAdminOrApiKey);

storageBoxRouter.onError((err, c) => {
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

// ─── Config routes ──────────────────────────────────────────────────

storageBoxRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs",
    tags: [TAG_CFG],
    summary: "Create a storage box config",
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
    const row = await storageBoxService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs",
    tags: [TAG_CFG],
    summary: "List storage box configs",
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
    const rows = await storageBoxService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Get a storage box config by id or alias",
    request: { params: IdParamSchema },
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
    const row = await storageBoxService.getConfig(orgId, id);
    return c.json(serializeConfig(row), 200);
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Update a storage box config",
    request: {
      params: IdParamSchema,
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
    const row = await storageBoxService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeConfig(row), 200);
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Delete a storage box config (cascades to deposits)",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await storageBoxService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Transaction routes ─────────────────────────────────────────────

storageBoxRouter.openapi(
  createRoute({
    method: "post",
    path: "/deposits",
    tags: [TAG_TXN],
    summary: "Deposit currency into a storage box on behalf of an end user",
    request: {
      body: { content: { "application/json": { schema: DepositSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: DepositResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const now = new Date();
    const result = await storageBoxService.deposit({
      organizationId: orgId,
      input,
      now,
    });
    const config = await storageBoxService.getConfig(orgId, input.boxConfigId);
    return c.json(
      {
        deposit: serializeDepositView(
          viewFromDepositAndConfig(result.deposit, config, now),
        ),
        currencyDeducted: result.currencyDeducted,
      },
      201,
    );
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "post",
    path: "/withdrawals",
    tags: [TAG_TXN],
    summary: "Withdraw from a storage box on behalf of an end user",
    request: {
      body: { content: { "application/json": { schema: WithdrawSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: WithdrawResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const now = new Date();
    const result = await storageBoxService.withdraw({
      organizationId: orgId,
      input,
      now,
    });
    const config = await storageBoxService.getConfig(
      orgId,
      result.deposit.boxConfigId,
    );
    return c.json(
      {
        deposit: serializeDepositView(
          viewFromDepositAndConfig(result.deposit, config, now),
        ),
        principalPaid: result.principalPaid,
        interestPaid: result.interestPaid,
        currencyGranted: result.currencyGranted,
      },
      200,
    );
  },
);

storageBoxRouter.openapi(
  createRoute({
    method: "get",
    path: "/deposits/{endUserId}",
    tags: [TAG_TXN],
    summary: "List a user's active storage box deposits (with projected interest)",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: DepositListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const rows = await storageBoxService.listDepositsForUser({
      organizationId: orgId,
      endUserId,
    });
    return c.json({ items: rows.map(serializeDepositView) }, 200);
  },
);
