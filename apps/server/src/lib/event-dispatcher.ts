/**
 * 统一事件 dispatcher —— 把所有需要异步消费的事件(capabilities 含 webhook
 * 或 trigger-rule)从 in-memory event-bus 转发到 EVENTS_QUEUE,一条事件
 * 一条 envelope,envelope.capabilities 是该事件命中的全部 async capability
 * 数组(不重复 send)。
 *
 * 取代之前的 webhooks/event-bridge.ts + triggers/event-bridge.ts 两个独立
 * bridge —— 之前一个事件有两条 capability 时会发两条 envelope,consumer 各
 * 处理一次,功能正确但 ~50% 冗余。统一 dispatcher 改成一条 envelope 多
 * capability,consumer 在路由时按 envelope.capabilities 数组分别派发到
 * webhook + trigger 两条业务路径。
 *
 * 约束:事件 payload 必须含 `organizationId` string —— 异步消费都是租户
 * 维度的。不含的事件直接 fail-closed 跳过 + warn(平台事件目前不进 queue,
 * 以后真有需要再加 platform-scoped 路径)。
 *
 * 失败语义:sink 抛错被 catch + log,不会向上冒。queue producer 失败由
 * 上层观测,不阻塞 emit。
 */

import type { EventCapability } from "./event-capability";
import type { EventBus } from "./event-bus";
import {
  listInternalEvents,
  type EffectiveInternalEvent,
} from "./event-registry";
import { logger } from "./logger";

/** 需要走 queue 的 capability(进程内 task / analytics 不在此列)。 */
const ASYNC_CAPABILITIES: ReadonlyArray<EventCapability> = [
  "webhook",
  "trigger-rule",
];

export type EventDispatchSink = (input: {
  eventName: string;
  orgId: string;
  payload: Record<string, unknown>;
  /** 该事件命中的全部 async capability(数组,可能 1 个或多个)。 */
  capabilities: ReadonlyArray<EventCapability>;
}) => Promise<void>;

export function installEventDispatcher(
  events: EventBus,
  sink: EventDispatchSink,
): void {
  for (const desc of listInternalEvents()) {
    const asyncCaps = pickAsyncCapabilities(desc);
    if (asyncCaps.length === 0) continue;

    events.on(desc.name as never, async (payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        logger.warn(
          `event-dispatcher: skipping ${desc.name} (payload is not an object)`,
        );
        return;
      }
      const p = payload as Record<string, unknown>;
      const orgId =
        typeof p.organizationId === "string" ? p.organizationId : null;
      if (!orgId) {
        logger.warn(
          `event-dispatcher: skipping ${desc.name} (missing organizationId)`,
        );
        return;
      }
      try {
        await sink({
          eventName: desc.name,
          orgId,
          payload: p,
          capabilities: asyncCaps,
        });
      } catch (err) {
        logger.error(
          `event-dispatcher: sink for "${desc.name}" failed`,
          err,
        );
      }
    });
  }
}

function pickAsyncCapabilities(
  desc: EffectiveInternalEvent,
): EventCapability[] {
  return desc.capabilities.filter((c) => ASYNC_CAPABILITIES.includes(c));
}
