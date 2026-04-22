/**
 * Admin-facing HTTP routes for the cdkey module.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import { ModuleError } from "./errors";
import { cdkeyService } from "./index";
import {
  AdminRedeemSchema,
  BatchIdParamSchema,
  BatchKeyParamSchema,
  BatchListResponseSchema,
  BatchResponseSchema,
  CodeIdParamSchema,
  CodeListQuerySchema,
  CodeListResponseSchema,
  CreateBatchSchema,
  ErrorResponseSchema,
  GenerateCodesResponseSchema,
  GenerateCodesSchema,
  LogListQuerySchema,
  LogListResponseSchema,
  RedeemResultSchema,
  CodeResponseSchema,
  UpdateBatchSchema,
} from "./validators";
import type {
  CdkeyBatch,
  CdkeyCode,
  CdkeyRedemptionLog,
} from "./types";

const TAG_BATCH = "CDKey Batches";
const TAG_CODES = "CDKey Codes";
const TAG_REDEEM = "CDKey Redemption";
const TAG_LOGS = "CDKey Logs";

function serializeBatch(row: CdkeyBatch) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    codeType: row.codeType as "universal" | "unique",
    reward: row.reward,
    totalLimit: row.totalLimit,
    perUserLimit: row.perUserLimit,
    totalRedeemed: row.totalRedeemed,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeCode(row: CdkeyCode) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    batchId: row.batchId,
    code: row.code,
    status: row.status,
    redeemedBy: row.redeemedBy,
    redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeLog(row: CdkeyRedemptionLog) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    endUserId: row.endUserId,
    batchId: row.batchId,
    codeId: row.codeId,
    code: row.code,
    source: row.source,
    sourceId: row.sourceId,
    status: row.status,
    failReason: row.failReason,
    reward: (row.reward ?? null) as RewardEntry[] | null,
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

export const cdkeyRouter = createAdminRouter();

cdkeyRouter.use("*", requireAdminOrApiKey);

cdkeyRouter.onError((err, c) => {
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

// ─── Batch CRUD ────────────────────────────────────────────────────

cdkeyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/batches",
    tags: [TAG_BATCH],
    summary: "Create a cdkey batch (activity)",
    request: {
      body: {
        content: { "application/json": { schema: CreateBatchSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: BatchResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await cdkeyService.createBatch(orgId, c.req.valid("json"));
    return c.json(serializeBatch(row), 201);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/batches",
    tags: [TAG_BATCH],
    summary: "List cdkey batches",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: BatchListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await cdkeyService.listBatches(orgId);
    return c.json({ items: rows.map(serializeBatch) }, 200);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/batches/{key}",
    tags: [TAG_BATCH],
    summary: "Get a cdkey batch by id or alias",
    request: { params: BatchKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: BatchResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await cdkeyService.getBatch(orgId, key);
    return c.json(serializeBatch(row), 200);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/batches/{key}",
    tags: [TAG_BATCH],
    summary: "Update a cdkey batch",
    request: {
      params: BatchKeyParamSchema,
      body: { content: { "application/json": { schema: UpdateBatchSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: BatchResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await cdkeyService.updateBatch(orgId, key, c.req.valid("json"));
    return c.json(serializeBatch(row), 200);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/batches/{key}",
    tags: [TAG_BATCH],
    summary: "Delete a cdkey batch (cascades to codes, states, logs)",
    request: { params: BatchKeyParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    await cdkeyService.deleteBatch(orgId, key);
    return c.body(null, 204);
  },
);

// ─── Code management ──────────────────────────────────────────────

cdkeyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/batches/{batchId}/codes/generate",
    tags: [TAG_CODES],
    summary: "Append-generate unique codes for a batch",
    request: {
      params: BatchIdParamSchema,
      body: {
        content: { "application/json": { schema: GenerateCodesSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: GenerateCodesResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { batchId } = c.req.valid("param");
    const result = await cdkeyService.generateCodes(
      orgId,
      batchId,
      c.req.valid("json"),
    );
    return c.json(result, 200);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/batches/{batchId}/codes",
    tags: [TAG_CODES],
    summary: "List codes for a batch",
    request: {
      params: BatchIdParamSchema,
      query: CodeListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CodeListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { batchId } = c.req.valid("param");
    const q = c.req.valid("query");
    const res = await cdkeyService.listCodes(orgId, batchId, {
      status: q.status,
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });
    return c.json(
      { items: res.items.map(serializeCode), total: res.total },
      200,
    );
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/codes/{codeId}/revoke",
    tags: [TAG_CODES],
    summary: "Revoke a single code",
    request: { params: CodeIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CodeResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { codeId } = c.req.valid("param");
    const row = await cdkeyService.revokeCode(orgId, codeId);
    return c.json(serializeCode(row), 200);
  },
);

// CSV export — streaming per-batch codes.
cdkeyRouter.get("/batches/:batchId/codes.csv", async (c) => {
  const orgId = c.var.session!.activeOrganizationId!;
  const batchId = c.req.param("batchId")!;
  // Cap export at 50k for CF Worker memory/CPU safety.
  const res = await cdkeyService.listCodes(orgId, batchId, {
    limit: 50_000,
    offset: 0,
  });
  const lines = ["code,status,redeemedBy,redeemedAt,createdAt"];
  for (const row of res.items) {
    lines.push(
      [
        row.code,
        row.status,
        row.redeemedBy ?? "",
        row.redeemedAt ? row.redeemedAt.toISOString() : "",
        row.createdAt.toISOString(),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cdkey-${batchId}.csv"`,
    },
  });
});

// ─── Logs ─────────────────────────────────────────────────────────

cdkeyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/batches/{batchId}/logs",
    tags: [TAG_LOGS],
    summary: "List redemption logs for a batch",
    request: {
      params: BatchIdParamSchema,
      query: LogListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: LogListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { batchId } = c.req.valid("param");
    const q = c.req.valid("query");
    const res = await cdkeyService.listRedemptionLogs(orgId, batchId, {
      status: q.status,
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });
    return c.json(
      { items: res.items.map(serializeLog), total: res.total },
      200,
    );
  },
);

// ─── Admin redeem (service tools / manual grants) ─────────────────

cdkeyRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/redeem",
    tags: [TAG_REDEEM],
    summary: "Redeem a code on behalf of an end user (admin)",
    request: {
      body: { content: { "application/json": { schema: AdminRedeemSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: RedeemResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { code, endUserId, idempotencyKey } = c.req.valid("json");
    const result = await cdkeyService.redeem({
      organizationId: orgId,
      endUserId,
      code,
      idempotencyKey,
      source: "admin",
    });
    return c.json(result, 200);
  },
);

