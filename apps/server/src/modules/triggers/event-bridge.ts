/**
 * Trigger event-bridge —— 把 capabilities ⊇ ["trigger-rule"] 的内部事件
 * 推到 EVENTS_QUEUE,由 queue consumer 异步交给 triggerEngine.evaluate。
 *
 * 与 webhook event-bridge 平级，独立订阅同一 event-bus。两者都给 queue
 * 发消息（webhook 给只含 webhook capability 的 envelope；trigger 给只含
 * trigger-rule 的 envelope；M3+ 优化合并为 1 条 envelope 含 union capabilities，
 * 当前先两条 send 简化实现 —— Cloudflare Queues 起步阶段成本完全可忽略）。
 */

import type { EventCapability } from "../../lib/event-capability";
import type { EventBus } from "../../lib/event-bus";
import {
  listInternalEvents,
  type EffectiveInternalEvent,
} from "../../lib/event-registry";
import { logger } from "../../lib/logger";

export type TriggerEventSink = (input: {
  eventName: string;
  orgId: string;
  payload: Record<string, unknown>;
  capabilities: ReadonlyArray<EventCapability>;
}) => Promise<void>;

export function installTriggerEventBridge(
  events: EventBus,
  sink: TriggerEventSink,
): void {
  for (const desc of listInternalEvents()) {
    if (!hasTriggerCapability(desc)) continue;
    events.on(desc.name as never, async (payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        logger.warn(
          `trigger-bridge: skipping ${desc.name} (payload is not an object)`,
        );
        return;
      }
      const p = payload as Record<string, unknown>;
      const orgId = typeof p.organizationId === "string" ? p.organizationId : null;
      if (!orgId) {
        logger.warn(
          `trigger-bridge: skipping ${desc.name} (missing organizationId)`,
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
          `trigger-bridge: sink for "${desc.name}" failed`,
          err,
        );
      }
    });
  }
}

function hasTriggerCapability(desc: EffectiveInternalEvent): boolean {
  return desc.capabilities.includes("trigger-rule");
}
