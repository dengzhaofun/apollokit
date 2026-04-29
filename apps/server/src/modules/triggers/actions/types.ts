/**
 * Action handler 通用契约。
 */

import type { EventBus } from "../../../lib/event-bus";

/**
 * Action 执行上下文 —— 所有 handler 共享，避免每个 handler 自己 import 单例。
 */
export type ActionContext = {
  orgId: string;
  /** 触发该规则的事件名（与 actions[N].eventName 不同 —— 后者是要 emit 的事件）。 */
  triggerEventName: string;
  /** 触发该规则的事件 payload —— 给 emit_event 模板替换用。 */
  triggerPayload: Record<string, unknown>;
  /** 防递归层级；emit_event handler 增加这个值。 */
  depth: number;
  /** Trace 关联。 */
  traceId: string;
};

/**
 * 共享依赖 —— 仅 server 内部能力。
 *
 * 注意:不包含 webhooks。Trigger 引擎是"内循环替代 webhook"的设计,
 * 想出墙到外部 webhook 的事件流走 webhook 模块自动 fan-out,不经 trigger。
 */
export type ActionDeps = {
  events: EventBus;
};

/**
 * Handler 签名 —— 抛错由 service 层捕获并写入 actionResults，handler 自己
 * 不需要 try/catch。
 */
export type ActionHandler<A = unknown> = (
  action: A,
  ctx: ActionContext,
  deps: ActionDeps,
) => Promise<{ data?: Record<string, unknown> } | void>;

/** 防递归上限。emit_event 链超过此值直接拒绝。 */
export const MAX_EMIT_DEPTH = 3;
