/**
 * 启动时把所有已注册 kind handler 的 subscribedEvents 接到 eventBus。
 *
 * 使用方式：在所有 kind handler 完成注册 **之后** 调用一次
 * `wireKindEventSubscriptions(deps)`。推荐在根 `src/index.ts` 里
 * import 完 battle-pass 等业务 module（其 barrel 会调用
 * `kindRegistry.register(...)`）之后调用。如果放在 activity 模块的
 * barrel 里，会出现 activity → battle-pass → activity 的循环 import。
 *
 * Handler 内部抛错会被捕获并记录，不中断 eventBus 的其他订阅者，
 * 符合 event-bus.ts 的 "emit() is always safe" 契约。
 */

import type { AppDeps } from "../../../deps";
import type { EventMap } from "../../../lib/event-bus";
import { kindRegistry } from "./registry";
import { logger } from "../../../lib/logger";

export function wireKindEventSubscriptions(
  deps: Pick<AppDeps, "db" | "events">,
): void {
  const runtime = { db: deps.db, events: deps.events };

  for (const handler of kindRegistry.list()) {
    const subscribed = handler.subscribedEvents;
    if (!subscribed || subscribed.length === 0) continue;

    for (const eventName of subscribed) {
      // event-bus 的 on() 泛型约束 K extends keyof EventMap，而
      // subscribedEvents 在 type 层是 string。我们在 runtime 里把它
      // 当 keyof EventMap 用；handler 自己在 onEvent 里做 payload
      // 结构校验。
      deps.events.on(
        eventName as keyof EventMap,
        async (payload: unknown) => {
          try {
            await handler.onEvent?.({
              eventName,
              payload,
              runtime,
            });
          } catch (err) {
            logger.error(
              `[activity-kind] onEvent failed kind=${handler.kind} event=${eventName}:`,
              err,
            );
          }
        },
      );
    }
  }
}
