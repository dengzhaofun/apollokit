/**
 * 把内部 event-bus 上 registry 里标 forwardToTask=true 的事件，
 * 自动转调 taskService.processEvent。
 *
 * 约束：事件 payload 必须含 `organizationId` 和 `endUserId` string 字段。
 * 不含的事件 registry 会被标 forwardToTask=false（见 activity.state.changed
 * / activity.schedule.fired），自动跳过。
 *
 * 注册时机：task 模块 barrel 载入时。registry 必须先于这里填充 ——
 * 各 module 的 registerEvent 调用位于它们 barrel 顶部，且 task barrel
 * 由 `src/index.ts` 在它们之后 import（见 import 顺序）。
 */

import type { EventBus } from "../../lib/event-bus";
import { listInternalEvents } from "../../lib/event-registry";
import type { TaskService } from "./service";
import { logger } from "../../lib/logger";

export function installTaskEventForwarder(
  events: EventBus,
  task: TaskService,
): void {
  for (const desc of listInternalEvents()) {
    if (desc.forwardToTask === false) continue;

    // 事件名在 EventMap 里有编译期类型，但 listInternalEvents() 是 runtime
    // 枚举；用 `as never` 桥接。运行时由下面的 guard 强制校验 payload。
    events.on(
      desc.name as never,
      async (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const p = payload as Record<string, unknown>;
        const orgId =
          typeof p.organizationId === "string" ? p.organizationId : null;
        const endUserId =
          typeof p.endUserId === "string" ? p.endUserId : null;
        if (!orgId || !endUserId) {
          logger.warn(
            `task-forwarder: skipping ${desc.name} (missing organizationId / endUserId)`,
          );
          return;
        }
        try {
          await task.processEvent(orgId, endUserId, desc.name, p);
        } catch (err) {
          logger.error(
            `task-forwarder: processEvent(${desc.name}) failed`,
            err,
          );
        }
      },
    );
  }
}
