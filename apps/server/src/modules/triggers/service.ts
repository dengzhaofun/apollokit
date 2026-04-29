/**
 * Trigger 引擎 service —— protocol-agnostic business logic。
 *
 * 不导入 Hono / db 单例,通过 AppDeps 注入(参考 apps/server/CLAUDE.md
 * 的 service 层纯净规则)。
 *
 * 核心入口：`evaluate(orgId, eventName, payload, opts?)`
 * 由 src/queue.ts 的 consumer 在收到 capability=trigger-rule 的 envelope
 * 时调用。流程：
 *
 *   1. SELECT * FROM trigger_rules WHERE orgId=? AND triggerEvent=?
 *      AND status='active'
 *   2. 对每条规则：评估 condition (JSONLogic) → 节流检查 → 顺序跑 actions
 *   3. 每条规则一条 trigger_executions 行
 *
 * 失败语义：
 *   - 单个 action 抛错记录在 actionResults，继续后续 action（"partial"）
 *   - 评估自身抛错（DB 错、JSONLogic 配置爆炸）让 caller (queue consumer)
 *     处理重试 —— 这里只 throw，不写 executions
 *
 * 不在这里做的事：
 *   - HTTP 鉴权 / 解析 payload —— routes.ts 干
 *   - 事件订阅 —— src/index.ts 装配 trigger event-bridge,把 capabilities
 *     ⊇ ["trigger-rule"] 的事件 enqueue 到 EVENTS_QUEUE
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import type { EventBus } from "../../lib/event-bus";
import { logger } from "../../lib/logger";
import {
  triggerExecutions,
  triggerRules,
} from "../../schema/triggers";

import { actionRegistry } from "./actions";
import { evaluateCondition } from "./condition";
import {
  TriggerInvalidInput,
  TriggerRuleNotFound,
  TriggerVersionConflict,
} from "./errors";
import type { Throttler } from "./throttle";
import type {
  TriggerAction,
  TriggerActionResult,
  TriggerExecutionStatus,
  TriggerRuleRow,
  TriggerRuleStatus,
  TriggerThrottle,
} from "./types";
import { TRIGGER_RULE_STATUSES } from "./types";

type TriggerDeps = Pick<AppDeps, "db" | "events">;
type TriggerExternals = {
  throttler: Throttler;
};

export type CreateRuleInput = {
  name: string;
  description?: string;
  status?: TriggerRuleStatus;
  triggerEvent: string;
  condition?: unknown;
  actions: TriggerAction[];
  throttle?: TriggerThrottle | null;
  graph?: unknown;
  createdBy?: string;
};

export type UpdateRuleInput = {
  name?: string;
  description?: string | null;
  status?: TriggerRuleStatus;
  triggerEvent?: string;
  condition?: unknown;
  actions?: TriggerAction[];
  throttle?: TriggerThrottle | null;
  graph?: unknown;
  /** 乐观锁 —— 客户端必须传上次读到的 version。 */
  version: number;
};

export type EvaluateOptions = {
  endUserId?: string;
  /** 触发该 evaluate 的 traceId,写入 executions 用于关联。 */
  traceId?: string;
  /** 已经经历的 emit_event 链层级,默认 0;src/queue.ts 解析 envelope.payload._depth。 */
  depth?: number;
  /** dry-run 模式：评估完整流程但不写 executions、不真发 webhook、不真 emit。 */
  dryRun?: boolean;
};

export type EvaluateResult = {
  ruleId: string;
  status: TriggerExecutionStatus;
  conditionResult: boolean | null;
  actionResults: TriggerActionResult[];
};

export function createTriggerService(
  deps: TriggerDeps,
  ext: TriggerExternals,
) {
  const { db, events } = deps;

  return {
    /**
     * 列出 org 下的所有规则（admin UI 用）。
     */
    async listRules(
      organizationId: string,
      filters?: { status?: TriggerRuleStatus; triggerEvent?: string },
    ): Promise<TriggerRuleRow[]> {
      const where = [eq(triggerRules.organizationId, organizationId)];
      if (filters?.status) where.push(eq(triggerRules.status, filters.status));
      if (filters?.triggerEvent)
        where.push(eq(triggerRules.triggerEvent, filters.triggerEvent));
      return db
        .select()
        .from(triggerRules)
        .where(and(...where))
        .orderBy(desc(triggerRules.updatedAt));
    },

    async getRule(
      organizationId: string,
      id: string,
    ): Promise<TriggerRuleRow> {
      const [row] = await db
        .select()
        .from(triggerRules)
        .where(
          and(
            eq(triggerRules.organizationId, organizationId),
            eq(triggerRules.id, id),
          ),
        )
        .limit(1);
      if (!row) throw new TriggerRuleNotFound(id);
      return row;
    },

    async createRule(
      organizationId: string,
      input: CreateRuleInput,
    ): Promise<TriggerRuleRow> {
      validateActions(input.actions);
      validateStatus(input.status);

      const [row] = await db
        .insert(triggerRules)
        .values({
          organizationId,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "active",
          triggerEvent: input.triggerEvent,
          condition: input.condition ?? null,
          actions: input.actions as unknown[],
          throttle: input.throttle ?? null,
          graph: input.graph ?? null,
          version: 1,
          createdBy: input.createdBy ?? null,
        })
        .returning();
      if (!row) throw new TriggerInvalidInput("insert returned no row");
      return row;
    },

    async updateRule(
      organizationId: string,
      id: string,
      input: UpdateRuleInput,
    ): Promise<TriggerRuleRow> {
      if (input.actions) validateActions(input.actions);
      if (input.status !== undefined) validateStatus(input.status);

      const updates: Partial<typeof triggerRules.$inferInsert> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined)
        updates.description = input.description ?? null;
      if (input.status !== undefined) updates.status = input.status;
      if (input.triggerEvent !== undefined)
        updates.triggerEvent = input.triggerEvent;
      if (input.condition !== undefined)
        updates.condition = input.condition ?? null;
      if (input.actions !== undefined)
        updates.actions = input.actions as unknown[];
      if (input.throttle !== undefined)
        updates.throttle = input.throttle ?? null;
      if (input.graph !== undefined) updates.graph = input.graph ?? null;
      // 乐观锁:version 字段在 SET 子句里 +1,WHERE 子句锁旧 version。
      const [row] = await db
        .update(triggerRules)
        .set({
          ...updates,
          version: sql`${triggerRules.version} + 1`,
        })
        .where(
          and(
            eq(triggerRules.organizationId, organizationId),
            eq(triggerRules.id, id),
            eq(triggerRules.version, input.version),
          ),
        )
        .returning();

      if (!row) {
        // 区分:行不存在 vs version 失配
        const exists = await db
          .select({ id: triggerRules.id })
          .from(triggerRules)
          .where(
            and(
              eq(triggerRules.organizationId, organizationId),
              eq(triggerRules.id, id),
            ),
          )
          .limit(1);
        if (exists.length === 0) throw new TriggerRuleNotFound(id);
        throw new TriggerVersionConflict(id);
      }
      return row;
    },

    /**
     * 软删 —— 改 status='archived'。彻底删除（含 executions 级联）由后台
     * 90d 清理 cron 干（M3.5）。
     */
    async archiveRule(organizationId: string, id: string): Promise<void> {
      const [row] = await db
        .update(triggerRules)
        .set({ status: "archived" })
        .where(
          and(
            eq(triggerRules.organizationId, organizationId),
            eq(triggerRules.id, id),
          ),
        )
        .returning({ id: triggerRules.id });
      if (!row) throw new TriggerRuleNotFound(id);
    },

    /**
     * 评估 + 执行 —— 对所有匹配的 active 规则各自跑一遍。
     * 返回每条规则的执行摘要，便于 dry-run 模式直接返给 admin UI。
     */
    async evaluate(
      orgId: string,
      eventName: string,
      payload: Record<string, unknown>,
      opts: EvaluateOptions = {},
    ): Promise<EvaluateResult[]> {
      const rules = await db
        .select()
        .from(triggerRules)
        .where(
          and(
            eq(triggerRules.organizationId, orgId),
            eq(triggerRules.triggerEvent, eventName),
            eq(triggerRules.status, "active"),
          ),
        )
        .orderBy(asc(triggerRules.createdAt));

      if (rules.length === 0) return [];

      const results: EvaluateResult[] = [];
      const endUserId =
        typeof payload.endUserId === "string" ? payload.endUserId : undefined;
      const traceId = opts.traceId ?? "";
      const depth = opts.depth ?? 0;

      for (const rule of rules) {
        const ruleResult = await runOneRule({
          rule,
          orgId,
          eventName,
          payload,
          endUserId,
          traceId,
          depth,
          db,
          events,
          ext,
          dryRun: opts.dryRun ?? false,
        });
        results.push(ruleResult);
      }
      return results;
    },
  };
}

export type TriggerService = ReturnType<typeof createTriggerService>;

// ────────────────────────────────────────────────────────────────────────
// internals
// ────────────────────────────────────────────────────────────────────────

function validateActions(actions: TriggerAction[]): void {
  if (!Array.isArray(actions)) {
    throw new TriggerInvalidInput("actions must be an array");
  }
  for (const a of actions) {
    if (!a || typeof a !== "object" || typeof a.type !== "string") {
      throw new TriggerInvalidInput(
        "each action must be an object with a string `type`",
      );
    }
    if (!(a.type in actionRegistry)) {
      throw new TriggerInvalidInput(`unknown action type: ${a.type}`);
    }
  }
}

function validateStatus(status: TriggerRuleStatus | undefined): void {
  if (status === undefined) return;
  if (!TRIGGER_RULE_STATUSES.includes(status)) {
    throw new TriggerInvalidInput(`invalid rule status: ${status}`);
  }
}

async function runOneRule(args: {
  rule: TriggerRuleRow;
  orgId: string;
  eventName: string;
  payload: Record<string, unknown>;
  endUserId: string | undefined;
  traceId: string;
  depth: number;
  db: AppDeps["db"];
  events: EventBus;
  ext: TriggerExternals;
  dryRun: boolean;
}): Promise<EvaluateResult> {
  const { rule, orgId, eventName, payload, endUserId, traceId, depth, db, events, ext, dryRun } =
    args;
  const startedAt = new Date();
  const condResult = evaluateCondition(rule.condition, payload);
  let status: TriggerExecutionStatus;
  let actionResults: TriggerActionResult[] = [];

  if (!condResult) {
    status = "condition_failed";
  } else {
    // 节流检查 —— rule.throttle 形如 { perUserPerHour: 5 }（可能 null）。
    const throttleConfig = rule.throttle as TriggerThrottle | null;
    const throttle = await ext.throttler.check({
      ruleId: rule.id,
      orgId,
      endUserId,
      throttle: throttleConfig,
      now: startedAt,
    });
    if (!throttle.allowed) {
      status = "throttled";
    } else {
      const ruleActions = rule.actions as TriggerAction[];
      actionResults = await runActions({
        actions: ruleActions,
        orgId,
        eventName,
        payload,
        depth,
        traceId,
        events,
        dryRun,
      });
      status = computeOverallStatus(actionResults);
    }
  }

  if (!dryRun) {
    try {
      await db.insert(triggerExecutions).values({
        organizationId: orgId,
        ruleId: rule.id,
        ruleVersion: rule.version,
        eventName,
        endUserId: endUserId ?? null,
        traceId: traceId || null,
        conditionResult: condResult ? "true" : "false",
        actionResults,
        startedAt,
        finishedAt: new Date(),
        status,
      });
    } catch (err) {
      logger.error(
        `[trigger-service] failed to write execution for rule ${rule.id}`,
        err,
      );
      // 审计写失败不影响业务结果 —— 已经执行了 actions。
    }
  }

  return {
    ruleId: rule.id,
    status,
    conditionResult: condResult,
    actionResults,
  };
}

async function runActions(args: {
  actions: TriggerAction[];
  orgId: string;
  eventName: string;
  payload: Record<string, unknown>;
  depth: number;
  traceId: string;
  events: EventBus;
  dryRun: boolean;
}): Promise<TriggerActionResult[]> {
  const { actions, orgId, eventName, payload, depth, traceId, events, dryRun } = args;
  const ctx = {
    orgId,
    triggerEventName: eventName,
    triggerPayload: payload,
    depth: depth + 1, // 每深入一层 +1（emit_event 行为）
    traceId,
  };
  const deps = { events };

  const results: TriggerActionResult[] = [];
  for (const action of actions) {
    const startedAt = Date.now();
    const handler = actionRegistry[action.type];
    if (!handler) {
      results.push({
        type: action.type,
        status: "failed",
        durationMs: 0,
        error: `unknown action type: ${action.type}`,
      });
      continue;
    }
    if (dryRun) {
      // dry-run 不真执行，但记录"会执行"以便 UI 反馈
      results.push({
        type: action.type,
        status: "skipped",
        durationMs: 0,
        data: { reason: "dry_run" },
      });
      continue;
    }
    try {
      const out = (await handler(action, ctx, deps)) ?? {};
      results.push({
        type: action.type,
        status: "success",
        durationMs: Date.now() - startedAt,
        data: out.data,
      });
    } catch (err) {
      results.push({
        type: action.type,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: errorMessage(err),
      });
    }
  }
  return results;
}

function computeOverallStatus(
  results: TriggerActionResult[],
): TriggerExecutionStatus {
  if (results.length === 0) return "success";
  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  if (failedCount === 0) return "success";
  if (successCount === 0) return "failed";
  return "partial";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

// re-exports for routes
export type { TriggerInvalidInput, TriggerRuleNotFound, TriggerVersionConflict };
// satisfy unused-import linting where needed
void inArray;
