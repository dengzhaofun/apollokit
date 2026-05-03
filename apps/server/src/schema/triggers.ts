import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

/**
 * Trigger 引擎 —— 让运营人员在 admin 里画「事件 → 条件 → 动作」规则，
 * 由 queue consumer 异步执行，无需走 webhook 出墙再回到 SDK。
 *
 * 设计文档：~/.claude/plans/trigger-polished-lemur.md M3 段。
 *
 * 数据流：events.emit(name, payload) → events 队列 envelope → consumer
 * 路由 capabilities ⊇ ["trigger-rule"] 的消息到 triggerEngine.evaluate
 * → 查 trigger_rules WHERE triggerEvent = name AND status='active' →
 * 评估 condition (JSONLogic) → 节流检查 → 顺序执行 actions → 写
 * trigger_executions 审计。
 */

/**
 * 单条规则定义。条件是 JSONLogic 表达式（参考 https://jsonlogic.com），
 * actions 是数组，按数组顺序执行；任一 action 失败不中断后续，
 * 失败状态记录在 trigger_executions.actionResults。
 *
 * `graph` 字段持久化 xyflow / react-flow 的 nodes + edges，admin 重新
 * 打开规则时直接复原画布；运行时不读，只读 `triggerEvent` / `condition`
 * / `actions` 这三个 normalized 字段。
 *
 * `version` 是乐观锁 —— 每次 PATCH +1，并发更新检测靠 WHERE version=X。
 *
 * `throttle` 例 `{ perUserPerHour: 5, perOrgPerMinute: 100 }` —— 节流键
 * 走 Upstash Redis（详见 modules/triggers/throttle.ts）；fail-open，
 * Redis 故障不阻塞规则执行。
 */
export const triggerRules = pgTable(
  "trigger_rules",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** 'active' | 'disabled' | 'archived'（archived = 软删，列表默认隐藏） */
    status: text("status").notNull().default("active"),
    /** 触发事件名，对应 event-registry 里的 name —— 例 "level.cleared"。 */
    triggerEvent: text("trigger_event").notNull(),
    /** JSONLogic 表达式，null = 无条件触发（每次事件都跑）。 */
    condition: jsonb("condition").$type<unknown>(),
    /** 动作数组，TriggerAction[]（详见 modules/triggers/types.ts）。 */
    actions: jsonb("actions").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** 节流配置；null = 不限频。 */
    throttle: jsonb("throttle").$type<Record<string, number>>(),
    /** xyflow nodes + edges；运行时不读，仅供 admin 复原画布。 */
    graph: jsonb("graph").$type<unknown>(),
    /** 乐观锁；PATCH 必须带当前 version 才能成功更新。 */
    version: integer("version").default(1).notNull(),
    /** 创建者（Better Auth user id）；删除规则时不级联（保留审计）。 */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 同 org 内规则名唯一（friendly identifier in admin UI）。
    uniqueIndex("trigger_rules_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
    // queue consumer 主查询：(orgId, triggerEvent) 列出所有 active 规则。
    index("trigger_rules_tenant_event_status_idx").on(
      table.tenantId,
      table.triggerEvent,
      table.status,
    ),
  ],
);

/**
 * 单次规则触发的审计日志。每个 evaluate(orgId, eventName, payload) 调用
 * 对每条匹配的规则产出一行（即使条件 false 或被节流——可以看到 trigger
 * 引擎的可见行为）。
 *
 * `actionResults` 形如：
 *   [{ type: "dispatch_webhook", status: "success", durationMs: 12 },
 *    { type: "grant_reward", status: "failed", error: "ItemNotFound" }]
 *
 * `status` 反映整体观感：
 *   - 'success'          所有 action 都 success
 *   - 'partial'          有 action 失败但至少一个成功
 *   - 'failed'           所有 action 失败 / evaluate 抛错
 *   - 'throttled'        被节流，未执行任何 action
 *   - 'condition_failed' 条件 false，未执行任何 action
 *
 * Retention：admin 列表 / 调试审计用，30 天保留窗口由后续 cron 清理
 * （类似 webhook deliveries）。
 */
export const triggerExecutions = pgTable(
  "trigger_executions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => triggerRules.id, { onDelete: "cascade" }),
    /** 规则被触发时的 version 快照 —— 让审计看到「当时的规则形态」。 */
    ruleVersion: integer("rule_version").notNull(),
    /** 实际触发的事件名（与 rule.triggerEvent 应相等，但快照入库便于查）。 */
    eventName: text("event_name").notNull(),
    /** 关联的 endUser；可空（平台级事件如 activity.state.changed）。 */
    endUserId: text("end_user_id"),
    /** queue envelope 上的 traceId；让审计与原请求 trace 关联。 */
    traceId: text("trace_id"),
    /** condition 评估结果；null = 无条件规则。 */
    conditionResult: text("condition_result"),
    /** 详见上方注释 */
    actionResults: jsonb("action_results").$type<unknown[]>(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    /** 'success' | 'partial' | 'failed' | 'throttled' | 'condition_failed' */
    status: text("status").notNull(),
  },
  (table) => [
    // admin "this rule's history" 查询。
    index("trigger_executions_tenant_rule_started_idx").on(
      table.tenantId,
      table.ruleId,
      table.startedAt,
    ),
    // admin "show recent failures" 查询。
    index("trigger_executions_tenant_status_started_idx").on(
      table.tenantId,
      table.status,
      table.startedAt,
    ),
  ],
);
