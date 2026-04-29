/**
 * Action: emit_event —— 链式触发另一个内部事件,可以驱动其它 trigger 规则
 * 形成 cascading workflow。例如：
 *   规则 A: level.cleared(level==10) → emit_event "feature.unlocked"
 *   规则 B: feature.unlocked         → dispatch_webhook + send_notification
 *
 * 防递归：ActionContext.depth 由 service.evaluate 维护，每深入一层 +1，
 * 超过 MAX_EMIT_DEPTH 直接拒绝（throw）。runtime 已经把 events.emit 设计成
 * fire-and-forget，不会卡住 publisher，但深度限制能防止意外的死循环。
 */

import type { EmitEventAction } from "../types";

import { MAX_EMIT_DEPTH, type ActionHandler } from "./types";

export const emitEventAction: ActionHandler<EmitEventAction> = async (
  action,
  ctx,
  deps,
) => {
  if (ctx.depth >= MAX_EMIT_DEPTH) {
    throw new Error(
      `emit_event depth ${ctx.depth} ≥ MAX_EMIT_DEPTH (${MAX_EMIT_DEPTH}) — refusing to chain further (rule misconfigured?)`,
    );
  }

  // 在 data 里注入 organizationId（trigger 引擎是 org-scoped），调用方未给则补。
  const enrichedData = {
    organizationId: ctx.orgId,
    ...action.data,
  };

  // events.emit 是 await 的同步 fan-out，等所有 sync handler 跑完。webhook
  // bridge 会在这里再次入 queue，trigger consumer 再次 evaluate —— depth
  // 检查由 evaluate 入口处增加。
  await deps.events.emit(action.eventName as never, enrichedData as never);

  return { data: { eventName: action.eventName } };
};
