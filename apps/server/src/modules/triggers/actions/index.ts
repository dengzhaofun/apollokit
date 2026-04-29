/**
 * Action handler registry —— 把 TriggerAction.type 字符串映射到 handler。
 *
 * 设计原则:trigger action 仅"内循环"能力(参考 modules/triggers/types.ts 注释)。
 *
 * 新增 action 类型 4 步：
 *   1. 在 modules/triggers/types.ts 加 union 成员
 *   2. 在 actions/<key>.ts 写 ActionHandler 实现
 *   3. 在这里 import + 注册到 registry
 *   4. 在 admin UI 的 ActionNode 加表单 schema
 */

import { TriggerActionNotImplemented } from "../errors";
import type { TriggerAction } from "../types";

import { emitEventAction } from "./emit-event";
import type { ActionHandler } from "./types";

/** 已实现 handler 的类型集合;UI 用它过滤可用 action 列表。 */
export const IMPLEMENTED_ACTION_TYPES = ["emit_event"] as const;

export type ImplementedActionType = (typeof IMPLEMENTED_ACTION_TYPES)[number];

/**
 * Stub handler —— grant_reward / unlock_feature / send_notification 等待
 * 接入对应 module 后填充。当前阶段抛 TriggerActionNotImplemented 让
 * service 写一行 actionResults.status='failed' 并继续后续 action。
 */
const notImplemented =
  (actionType: TriggerAction["type"]): ActionHandler =>
  async () => {
    throw new TriggerActionNotImplemented(actionType);
  };

export const actionRegistry: Record<TriggerAction["type"], ActionHandler> = {
  emit_event: emitEventAction as ActionHandler,
  grant_reward: notImplemented("grant_reward"),
  unlock_feature: notImplemented("unlock_feature"),
  send_notification: notImplemented("send_notification"),
};

export type { ActionContext, ActionDeps, ActionHandler } from "./types";
export { MAX_EMIT_DEPTH } from "./types";
