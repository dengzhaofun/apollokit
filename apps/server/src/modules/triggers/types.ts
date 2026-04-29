/**
 * Trigger 引擎 runtime / wire 类型。
 * Schema 类型从 schema/triggers.ts 推导（行类型），见底部。
 */

import type {
  triggerExecutions,
  triggerRules,
} from "../../schema/triggers";

export const TRIGGER_RULE_STATUSES = [
  "active",
  "disabled",
  "archived",
] as const;
export type TriggerRuleStatus = (typeof TRIGGER_RULE_STATUSES)[number];

export const TRIGGER_EXECUTION_STATUSES = [
  "success",
  "partial",
  "failed",
  "throttled",
  "condition_failed",
] as const;
export type TriggerExecutionStatus =
  (typeof TRIGGER_EXECUTION_STATUSES)[number];

/**
 * 已支持的 action 类型集合 —— 仅"内循环"能力。
 *
 * Trigger 引擎的设计意图是替代「事件出墙 → 用户 SDK 代码 → 调 server API」
 * 那条链路,所以 action 必须是 server 内部能直接执行的能力。想要把事件
 * 推到外部 webhook?走 webhook 模块自身的订阅(事件总线已经自动 fan-out
 * capability=webhook 的事件,不需要 trigger 介入)。
 *
 * 新增 action 必须:
 *   1. 在这里登记类型签名
 *   2. 在 modules/triggers/actions/<key>.ts 写 handler
 *   3. 在 modules/triggers/actions/index.ts 注册到 actionRegistry
 */
export type TriggerAction =
  | EmitEventAction
  | GrantRewardAction
  | UnlockFeatureAction
  | SendNotificationAction;

/** Chain another internal event onto the bus (recursion guard depth ≤ 3). */
export type EmitEventAction = {
  type: "emit_event";
  eventName: string;
  data: Record<string, unknown>;
};

/** Grant a reward via the unified reward system (M3.5 stub). */
export type GrantRewardAction = {
  type: "grant_reward";
  rewardKindKey: string;
  amount: number;
  reason: string;
};

/** Unlock a feature flag for the user (M3.5 stub). */
export type UnlockFeatureAction = {
  type: "unlock_feature";
  featureKey: string;
};

/** Send a notification via the notification module (M3.5 stub). */
export type SendNotificationAction = {
  type: "send_notification";
  templateKey: string;
  vars?: Record<string, unknown>;
};

/**
 * Action 执行结果，写入 trigger_executions.actionResults。
 */
export type TriggerActionResult = {
  type: TriggerAction["type"];
  status: "success" | "failed" | "skipped";
  durationMs: number;
  error?: string;
  /** Action 特定的 metadata，例如 dispatch_webhook 的 queued count。 */
  data?: Record<string, unknown>;
};

/**
 * Throttle 配置 —— 任意 key + 数字限频。null 字段忽略。
 *
 *   { perUserPerMinute: 2, perUserPerHour: 10, perOrgPerMinute: 100 }
 */
export type TriggerThrottle = {
  perUserPerMinute?: number;
  perUserPerHour?: number;
  perUserPerDay?: number;
  perOrgPerMinute?: number;
  perOrgPerHour?: number;
};

export type TriggerRuleRow = typeof triggerRules.$inferSelect;
export type TriggerExecutionRow = typeof triggerExecutions.$inferSelect;

/**
 * View shape returned by routes — strips internals not relevant to admin UI.
 */
export type TriggerRuleView = Omit<TriggerRuleRow, never>;
