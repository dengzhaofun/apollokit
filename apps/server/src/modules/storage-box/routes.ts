/**
 * Admin-facing HTTP routes for the storage-box module.
 *
 * All endpoints are guarded by requireAdminOrApiKey and scoped to the
 * caller's active organization. End-user-initiated deposit/withdraw
 * flows are invoked by the admin (or an API key) on behalf of a given
 * `endUserId`. A public player-facing router is out of scope for MVP
 * (per apps/server/CLAUDE.md — "No public routes yet").
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { MoveBodySchema } from "../../lib/fractional-order";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
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

export const storageBoxRouter = createAdminRouter();

storageBoxRouter.use("*", requireAdminOrApiKey);
storageBoxRouter.use("*", requirePermissionByMethod("storageBox"));

// ─── Config routes ──────────────────────────────────────────────────

storageBoxRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(ConfigResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await storageBoxService.createConfig(orgId, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 201);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG_CFG],
    summary: "List storage box configs",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ConfigListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await storageBoxService.listConfigs(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeConfig), nextCursor: page.nextCursor }),
      200,
    );
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Get a storage box config by id or alias",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ConfigResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await storageBoxService.getConfig(orgId, id);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(ConfigResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await storageBoxService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeConfig(row)), 200);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{id}/move",
    tags: [TAG_CFG],
    summary: "Move a storage box config (drag/top/bottom/up/down)",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ConfigResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await storageBoxService.moveConfig(orgId, id, body);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG_CFG],
    summary: "Delete a storage box config (cascades to deposits)",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await storageBoxService.deleteConfig(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Transaction routes ─────────────────────────────────────────────

storageBoxRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(DepositResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const now = new Date();
    const result = await storageBoxService.deposit({
      organizationId: orgId,
      input,
      now,
    });
    const config = await storageBoxService.getConfig(orgId, input.boxConfigId);
    return c.json(ok({
        deposit: serializeDepositView(
          viewFromDepositAndConfig(result.deposit, config, now),
        ),
        currencyDeducted: result.currencyDeducted,
      }), 201,);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(WithdrawResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
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
    return c.json(ok({
        deposit: serializeDepositView(
          viewFromDepositAndConfig(result.deposit, config, now),
        ),
        principalPaid: result.principalPaid,
        interestPaid: result.interestPaid,
        currencyGranted: result.currencyGranted,
      }), 200,);
  },
);

storageBoxRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/deposits/{endUserId}",
    tags: [TAG_TXN],
    summary: "List a user's active storage box deposits (with projected interest)",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(DepositListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId } = c.req.valid("param");
    const rows = await storageBoxService.listDepositsForUser({
      organizationId: orgId,
      endUserId,
    });
    return c.json(ok({ items: rows.map(serializeDepositView) }), 200);
  },
);
