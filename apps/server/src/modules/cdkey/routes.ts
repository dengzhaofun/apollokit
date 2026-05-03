/**
 * Admin-facing HTTP routes for the cdkey module.
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import type { RewardEntry } from "../../lib/rewards";
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
    tenantId: row.tenantId,
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
    tenantId: row.tenantId,
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
    tenantId: row.tenantId,
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

export const cdkeyRouter = createAdminRouter();

cdkeyRouter.use("*", requireAdminOrApiKey);
cdkeyRouter.use("*", requirePermissionByMethod("cdkey"));

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
        content: { "application/json": { schema: envelopeOf(BatchResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await cdkeyService.createBatch(orgId, c.req.valid("json"));
    return c.json(ok(serializeBatch(row)), 201);
  },
);

cdkeyRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/batches",
    tags: [TAG_BATCH],
    summary: "List cdkey batches",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BatchListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await cdkeyService.listBatches(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeBatch), nextCursor: page.nextCursor }),
      200,
    );
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
        content: { "application/json": { schema: envelopeOf(BatchResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await cdkeyService.getBatch(orgId, key);
    return c.json(ok(serializeBatch(row)), 200);
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
        content: { "application/json": { schema: envelopeOf(BatchResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await cdkeyService.updateBatch(orgId, key, c.req.valid("json"));
    return c.json(ok(serializeBatch(row)), 200);
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
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    await cdkeyService.deleteBatch(orgId, key);
    return c.json(ok(null), 200);
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
          "application/json": { schema: envelopeOf(GenerateCodesResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { batchId } = c.req.valid("param");
    const result = await cdkeyService.generateCodes(
      orgId,
      batchId,
      c.req.valid("json"),
    );
    return c.json(ok(result), 200);
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
        content: { "application/json": { schema: envelopeOf(CodeListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { batchId } = c.req.valid("param");
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await cdkeyService.listCodes(orgId, batchId, q);
    return c.json(
      ok({ items: page.items.map(serializeCode), nextCursor: page.nextCursor }),
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
        content: { "application/json": { schema: envelopeOf(CodeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { codeId } = c.req.valid("param");
    const row = await cdkeyService.revokeCode(orgId, codeId);
    return c.json(ok(serializeCode(row)), 200);
  },
);

// CSV export — streaming per-batch codes.
cdkeyRouter.get("/batches/:batchId/codes.csv", async (c) => {
  const orgId = getOrgId(c);
  const batchId = c.req.param("batchId")!;
  // Cap export at 200 (server-side limit). CSV export should be reworked
  // to stream multiple pages if larger exports are needed.
  // TODO: paginate this loop to support large CSV exports.
  const res = await cdkeyService.listCodes(orgId, batchId, { limit: 200 });
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
        content: { "application/json": { schema: envelopeOf(LogListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { batchId } = c.req.valid("param");
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await cdkeyService.listRedemptionLogs(orgId, batchId, q);
    return c.json(
      ok({ items: page.items.map(serializeLog), nextCursor: page.nextCursor }),
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
        content: { "application/json": { schema: envelopeOf(RedeemResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { code, endUserId, idempotencyKey } = c.req.valid("json");
    const result = await cdkeyService.redeem({
      tenantId: orgId,
      endUserId,
      code,
      idempotencyKey,
      source: "admin",
    });
    return c.json(ok(result), 200);
  },
);

