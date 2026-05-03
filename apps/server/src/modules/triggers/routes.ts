/**
 * Admin-facing HTTP routes for the triggers module.
 *
 * 6 endpoints:
 *   GET    /rules                 列出规则
 *   POST   /rules                 创建
 *   GET    /rules/{id}            详情
 *   PATCH  /rules/{id}            更新（乐观锁）
 *   DELETE /rules/{id}            软删（archived）
 *   POST   /rules/{id}/dry-run    用样本 payload 试跑（不写 executions）
 *   GET    /executions            执行历史
 *
 * 鉴权：admin session OR `ak_` API key（与 webhooks routes 同款）。
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { triggerExecutions } from "../../schema/triggers";

import { triggerService } from "./index";
import type {
  TriggerAction,
  TriggerExecutionRow,
  TriggerRuleRow,
} from "./types";
import {
  CreateRuleSchema,
  DryRunResponseSchema,
  DryRunSchema,
  ExecutionListResponseSchema,
  ListExecutionsQuerySchema,
  RuleIdParamSchema,
  RuleListResponseSchema,
  RuleResponseSchema,
  UpdateRuleSchema,
} from "./validators";

const TAG = "Triggers";

function serializeRule(row: TriggerRuleRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    status: row.status as "active" | "disabled" | "archived",
    triggerEvent: row.triggerEvent,
    condition: row.condition ?? null,
    actions: (row.actions ?? []) as unknown[],
    throttle: (row.throttle ?? null) as Record<string, number> | null,
    graph: row.graph ?? null,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeExecution(row: TriggerExecutionRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    eventName: row.eventName,
    endUserId: row.endUserId,
    traceId: row.traceId,
    conditionResult: row.conditionResult,
    actionResults: row.actionResults as unknown[] | null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    status: row.status as
      | "success"
      | "partial"
      | "failed"
      | "throttled"
      | "condition_failed",
  };
}

export const triggersRouter = createAdminRouter();

triggersRouter.use("*", requireAdminOrApiKey);
triggersRouter.use("*", requirePermissionByMethod("triggers"));

// ─── GET /rules ────────────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/rules",
    tags: [TAG],
    summary: "List trigger rules for the current org.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RuleListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const items = await triggerService.listRules(orgId);
    return c.json(ok({ items: items.map(serializeRule) }), 200);
  },
);

// ─── POST /rules ───────────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/rules",
    tags: [TAG],
    summary: "Create a trigger rule.",
    request: {
      body: {
        content: { "application/json": { schema: CreateRuleSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(RuleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const userId = c.var.user?.id;
    const created = await triggerService.createRule(orgId, {
      ...body,
      // zod passthrough 推不出 TriggerAction discriminated union；
      // service.validateActions 在运行时做精确校验。
      actions: body.actions as unknown as TriggerAction[],
      createdBy: userId,
    });
    return c.json(ok(serializeRule(created)), 201);
  },
);

// ─── GET /rules/{id} ───────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/rules/{id}",
    tags: [TAG],
    summary: "Get a trigger rule by id.",
    request: { params: RuleIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RuleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await triggerService.getRule(orgId, id);
    return c.json(ok(serializeRule(row)), 200);
  },
);

// ─── PATCH /rules/{id} ─────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/rules/{id}",
    tags: [TAG],
    summary: "Update a trigger rule (optimistic lock — body must include current version).",
    request: {
      params: RuleIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateRuleSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RuleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updated = await triggerService.updateRule(orgId, id, {
      ...body,
      actions: body.actions as unknown as TriggerAction[] | undefined,
    });
    return c.json(ok(serializeRule(updated)), 200);
  },
);

// ─── DELETE /rules/{id} ────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/rules/{id}",
    tags: [TAG],
    summary: "Archive a trigger rule (soft delete; status='archived').",
    request: { params: RuleIdParamSchema },
    responses: {
      200: {
        description: "Archived",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await triggerService.archiveRule(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── POST /rules/{id}/dry-run ──────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/rules/{id}/dry-run",
    tags: [TAG],
    summary:
      "Simulate evaluating this rule against a sample payload. No actions are executed; no execution row is written.",
    request: {
      params: RuleIdParamSchema,
      body: {
        content: { "application/json": { schema: DryRunSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DryRunResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const { payload } = c.req.valid("json");
    // 拿单条规则；evaluate 只跑 triggerEvent 匹配的，构造该规则关心的 eventName。
    const rule = await triggerService.getRule(orgId, id);
    const results = await triggerService.evaluate(
      orgId,
      rule.triggerEvent,
      payload,
      { dryRun: true },
    );
    // dry-run 可能命中多条规则（同 triggerEvent + 同 org 的其它规则），
    // UI 只关心当前规则的结果 —— 但保留 array 让 UI 自决展示。
    return c.json(ok({ results }), 200);
  },
);

// ─── GET /executions ───────────────────────────────────────────────────
triggersRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/executions",
    tags: [TAG],
    summary: "List recent trigger executions.",
    request: { query: ListExecutionsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(ExecutionListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { ruleId, status, limit } = c.req.valid("query");
    const where = [eq(triggerExecutions.organizationId, orgId)];
    if (ruleId) where.push(eq(triggerExecutions.ruleId, ruleId));
    if (status) where.push(eq(triggerExecutions.status, status));
    const rows = await db
      .select()
      .from(triggerExecutions)
      .where(and(...where))
      .orderBy(desc(triggerExecutions.startedAt))
      .limit(limit);
    return c.json(ok({ items: rows.map(serializeExecution) }), 200);
  },
);
