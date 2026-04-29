/**
 * 把内部 event-bus 上 registry 里标 capabilities ⊇ ["webhook"] 的事件，
 * 自动 fan-out 到租户订阅的 webhook endpoint（通过 webhooksService.dispatch）。
 *
 * 约束：事件 payload 必须含 `organizationId` string 字段（webhook 是租户维度
 * 的能力）。不含的事件直接 fail-closed 跳过并 warn。
 *
 * 注册时机：webhook module barrel 装配后，由 src/index.ts 在所有 module
 * registerEvent 完成后显式调用（见 task forwarder 同款 pattern）。
 *
 * 投递路径：bridge 本身只负责"把事件转交给一个 sink"，sink 实现由调用方注入：
 *   - M1：sink 直接调 webhooksService.dispatch（同步 fan-out 到 deliveries 表）
 *   - M2：sink 改为 env.EVENTS_QUEUE.send，由 queue consumer 异步 dispatch
 *   bridge 本身完全不感知这层切换，方便后续无痛迁移到 CF Queues。
 *
 * 失败语义：sink 抛错被 catch + log，不会向上冒（与 task forwarder 一致），
 * 单条事件 fan-out 失败不影响其他订阅者。webhook 投递重试由 deliveries
 * 表 + cron pull 保证 at-least-once，不依赖 bridge 层重试。
 */

import type { EventCapability } from "../../lib/event-capability";
import type { EventBus } from "../../lib/event-bus";
import {
  listInternalEvents,
  type EffectiveInternalEvent,
} from "../../lib/event-registry";
import { logger } from "../../lib/logger";

/**
 * 桥接 sink：拿到一条「需要 fan-out 到 webhook」的事件后该怎么处理。
 *
 * - `eventName` / `payload` 来自 events.emit。
 * - `orgId` 已由 bridge 抽取并校验（必非空）。
 * - `capabilities` 是事件 registry 的快照，sink 据此构造 EventEnvelope，
 *   让下游 queue consumer 在跨 isolate 边界仍能做正确的能力路由。
 * - 返回 promise 以便上层 await（M1）或 fire-and-forget（M2 经 queue）。
 */
export type WebhookEventSink = (input: {
  eventName: string;
  orgId: string;
  payload: Record<string, unknown>;
  capabilities: ReadonlyArray<EventCapability>;
}) => Promise<void>;

export function installWebhookEventBridge(
  events: EventBus,
  sink: WebhookEventSink,
): void {
  for (const desc of listInternalEvents()) {
    if (!hasWebhookCapability(desc)) continue;

    // 事件名在 EventMap 里有编译期类型，但 listInternalEvents() 是 runtime
    // 枚举；用 `as never` 桥接，运行时由下面的 guard 校验 payload 形状。
    events.on(desc.name as never, async (payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        logger.warn(
          `webhook-bridge: skipping ${desc.name} (payload is not an object)`,
        );
        return;
      }
      const p = payload as Record<string, unknown>;
      const orgId = typeof p.organizationId === "string" ? p.organizationId : null;
      if (!orgId) {
        logger.warn(
          `webhook-bridge: skipping ${desc.name} (missing organizationId)`,
        );
        return;
      }
      try {
        await sink({
          eventName: desc.name,
          orgId,
          payload: p,
          capabilities: desc.capabilities,
        });
      } catch (err) {
        logger.error(
          `webhook-bridge: sink for "${desc.name}" failed`,
          err,
        );
      }
    });
  }
}

function hasWebhookCapability(desc: EffectiveInternalEvent): boolean {
  return desc.capabilities.includes("webhook");
}
