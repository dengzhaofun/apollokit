/**
 * 薄包装：把 activity 生命周期事件广播给对应 kind 的 handler。
 *
 * activity/service.ts 在 tickDue 状态流转 / runArchiveCleanup 里调用
 * 这两个函数。Handler 自己抛错不会打断 activity 核心逻辑 —— 错误捕获
 * 后打日志，下次 tick 不会重试（状态已切换）。清理失败时 handler
 * 自己负责补偿或人工介入。
 */

import type { AppDeps } from "../../../deps";
import type { EventBus } from "../../../lib/event-bus";
import type { ActivityConfig } from "../../../schema/activity";
import type { ActivityState } from "../types";
import { kindRegistry } from "./registry";

type Runtime = { db: AppDeps["db"]; events: EventBus };

export async function broadcastStateChange(params: {
  activity: ActivityConfig;
  prevState: ActivityState;
  nextState: ActivityState;
  runtime: Runtime;
}): Promise<void> {
  const handler = kindRegistry.resolve(params.activity.kind);
  if (!handler?.onStateChange) return;
  try {
    await handler.onStateChange(params);
  } catch (err) {
    console.error(
      `[activity-kind] onStateChange failed kind=${params.activity.kind} activity=${params.activity.id}:`,
      err,
    );
  }
}

export async function broadcastArchive(params: {
  activity: ActivityConfig;
  runtime: Runtime;
}): Promise<void> {
  const handler = kindRegistry.resolve(params.activity.kind);
  if (!handler?.onArchive) return;
  try {
    await handler.onArchive(params);
  } catch (err) {
    console.error(
      `[activity-kind] onArchive failed kind=${params.activity.kind} activity=${params.activity.id}:`,
      err,
    );
  }
}
