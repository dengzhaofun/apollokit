import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerAssistPoolSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("assist_pool.instance_created", (p) => {
    write({
      orgId: p.organizationId,
      // `endUserId` is the pool owner — the one who "initiated" it.
      endUserId: p.endUserId,
      event: "assist_pool.instance_created",
      source: "assist-pool",
      amount: p.targetAmount,
      eventData: {
        configId: p.configId,
        instanceId: p.instanceId,
        expiresAt: p.expiresAt,
      },
    });
  });

  events.on("assist_pool.contributed", (p) => {
    write({
      orgId: p.organizationId,
      // Session actor = the contributor (initiator), not the pool owner.
      // Keeps per-user contribution timeseries queryable.
      endUserId: p.initiatorEndUserId,
      event: "assist_pool.contributed",
      source: "assist-pool",
      amount: p.amount,
      eventData: {
        configId: p.configId,
        instanceId: p.instanceId,
        poolOwnerEndUserId: p.endUserId,
        remaining: p.remaining,
      },
    });
  });

  events.on("assist_pool.completed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "assist_pool.completed",
      source: "assist-pool",
      eventData: {
        configId: p.configId,
        instanceId: p.instanceId,
        rewards: p.rewards,
      },
    });
  });

  events.on("assist_pool.expired", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "assist_pool.expired",
      // `outcome` stays "ok" — expiry is a normal lifecycle terminal
      // state, not a system error. The reason is queryable via
      // `event_data.reason` ("timeout" | "force").
      source: "assist-pool",
      eventData: {
        configId: p.configId,
        instanceId: p.instanceId,
        reason: p.reason,
      },
    });
  });
}
