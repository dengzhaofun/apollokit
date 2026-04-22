/**
 * Admin-facing HTTP routes for the currency module.
 *
 * Covers: definition CRUD, wallet query, manual grant/deduct, ledger query.
 * Auth: mounted with `requireAdminOrApiKey` — same as the item module.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { currencyService } from "./index";
import { ModuleError } from "./errors";
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
  ErrorResponseSchema,
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
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  activityId: string | null;
  activityNodeId: string | null;
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
  organizationId: string;
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
    organizationId: row.organizationId,
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

export const currencyRouter = createAdminRouter();

currencyRouter.use("*", requireAdminOrApiKey);

currencyRouter.onError((err, c) => {
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
          "application/json": { schema: CurrencyDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await currencyService.createDefinition(
      orgId,
      c.req.valid("json"),
    );
    return c.json(serializeDefinition(row), 201);
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
          "application/json": { schema: DefinitionListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { activityId, isActive } = c.req.valid("query");
    const rows = await currencyService.listDefinitions(orgId, {
      activityId,
      isActive:
        isActive === undefined ? undefined : isActive === "true" ? true : false,
    });
    return c.json({ items: rows.map(serializeDefinition) }, 200);
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
          "application/json": { schema: CurrencyDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await currencyService.getDefinition(orgId, key);
    return c.json(serializeDefinition(row), 200);
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
          "application/json": { schema: CurrencyDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await currencyService.updateDefinition(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeDefinition(row), 200);
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
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await currencyService.deleteDefinition(orgId, id);
    return c.body(null, 204);
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
          "application/json": { schema: WalletListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("query");
    const wallets = await currencyService.getWallets(orgId, endUserId);
    return c.json({ items: wallets }, 200);
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
        content: { "application/json": { schema: BalanceResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, currencyId } = c.req.valid("param");
    const balance = await currencyService.getBalance(
      orgId,
      endUserId,
      currencyId,
    );
    return c.json({ currencyId, balance }, 200);
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
        content: { "application/json": { schema: GrantResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await currencyService.grant({
      organizationId: orgId,
      endUserId: body.endUserId,
      grants: body.grants,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(result, 200);
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
        content: { "application/json": { schema: DeductResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await currencyService.deduct({
      organizationId: orgId,
      endUserId: body.endUserId,
      deductions: body.deductions,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(result, 200);
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
          "application/json": { schema: LedgerListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const page = await currencyService.listLedger(orgId, q);
    return c.json(
      {
        items: page.items.map(serializeLedgerEntry),
        nextCursor: page.nextCursor,
      },
      200,
    );
  },
);
