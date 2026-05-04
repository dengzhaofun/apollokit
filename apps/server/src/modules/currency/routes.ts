/**
 * Admin-facing HTTP routes for the currency module.
 *
 * Covers: definition CRUD, wallet query, manual grant/deduct, ledger query.
 * Auth: mounted with `requireTenantSessionOrApiKey` — same as the item module.
 */

import type { HonoEnv } from "../../env";
import { MoveBodySchema } from "../../lib/fractional-order";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { currencyService } from "./index";
import {
  BalanceResponseSchema,
  CreateCurrencySchema,
  CurrencyDefinitionResponseSchema,
  CurrencyIdParamSchema,
  DeductCurrencySchema,
  DeductResultSchema,
  DefinitionListQuerySchema,
  DefinitionListResponseSchema,
  EndUserIdParamSchema,
  GrantCurrencySchema,
  GrantResultSchema,
  IdParamSchema,
  KeyParamSchema,
  LedgerListResponseSchema,
  LedgerQuerySchema,
  UpdateCurrencySchema,
  WalletListResponseSchema,
  WalletsQuerySchema,
} from "./validators";

const TAG_DEF = "Currency Definitions";
const TAG_WALLET = "Currency Wallet";
const TAG_LEDGER = "Currency Ledger";

function serializeDefinition(row: {
  id: string;
  tenantId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: string;
  isActive: boolean;
  activityId: string | null;
  activityNodeId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    activityId: row.activityId,
    activityNodeId: row.activityNodeId,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeLedgerEntry(row: {
  id: string;
  tenantId: string;
  endUserId: string;
  currencyId: string;
  delta: number;
  source: string;
  sourceId: string | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    endUserId: row.endUserId,
    currencyId: row.currencyId,
    delta: row.delta,
    source: row.source,
    sourceId: row.sourceId,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt.toISOString(),
  };
}

export const currencyRouter = createAdminRouter();

currencyRouter.use("*", requireTenantSessionOrApiKey);
currencyRouter.use("*", requirePermissionByMethod("currency"));

// ─── Definition CRUD ─────────────────────────────────────────────

currencyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "Create a currency",
    request: {
      body: {
        content: { "application/json": { schema: CreateCurrencySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CurrencyDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await currencyService.createDefinition(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeDefinition(row)), 201);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "List currencies",
    request: { query: DefinitionListQuerySchema },
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
    const orgId = getOrgId(c);
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await currencyService.listDefinitions(orgId, q);
    return c.json(
      ok({ items: page.items.map(serializeDefinition), nextCursor: page.nextCursor }),
      200,
    );
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Get a currency by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CurrencyDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await currencyService.getDefinition(orgId, key);
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/definitions/{id}",
    tags: [TAG_DEF],
    summary: "Update a currency",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateCurrencySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CurrencyDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await currencyService.updateDefinition(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/definitions/{key}/move",
    tags: [TAG_DEF],
    summary: "Move a currency definition (drag/top/bottom/up/down)",
    request: {
      params: KeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CurrencyDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await currencyService.moveDefinition(orgId, key, body);
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/definitions/{id}",
    tags: [TAG_DEF],
    summary: "Delete a currency",
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
    await currencyService.deleteDefinition(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Wallet / Balance ─────────────────────────────────────────────

currencyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/wallets",
    tags: [TAG_WALLET],
    summary: "List all wallets for a user",
    request: { query: WalletsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(WalletListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId } = c.req.valid("query");
    const wallets = await currencyService.getWallets(orgId, endUserId);
    return c.json(ok({ items: wallets }), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/wallets/{endUserId}/{currencyId}",
    tags: [TAG_WALLET],
    summary: "Get balance for a single currency",
    request: {
      params: EndUserIdParamSchema.merge(CurrencyIdParamSchema),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BalanceResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId, currencyId } = c.req.valid("param");
    const balance = await currencyService.getBalance(
      orgId,
      endUserId,
      currencyId,
    );
    return c.json(ok({ currencyId, balance }), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/wallets/grant",
    tags: [TAG_WALLET],
    summary: "Manually grant currencies to a user",
    request: {
      body: {
        content: { "application/json": { schema: GrantCurrencySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GrantResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const result = await currencyService.grant({
      tenantId: orgId,
      endUserId: body.endUserId,
      grants: body.grants,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(ok(result), 200);
  },
);

currencyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/wallets/deduct",
    tags: [TAG_WALLET],
    summary: "Manually deduct currencies from a user",
    request: {
      body: {
        content: { "application/json": { schema: DeductCurrencySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(DeductResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const result = await currencyService.deduct({
      tenantId: orgId,
      endUserId: body.endUserId,
      deductions: body.deductions,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(ok(result), 200);
  },
);

// ─── Ledger ─────────────────────────────────────────────────────

currencyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/ledger",
    tags: [TAG_LEDGER],
    summary: "Query currency ledger entries",
    request: { query: LedgerQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(LedgerListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await currencyService.listLedger(orgId, q);
    return c.json(ok({
        items: page.items.map(serializeLedgerEntry),
        nextCursor: page.nextCursor,
      }), 200,);
  },
);
