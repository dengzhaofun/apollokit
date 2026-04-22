import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerLotterySubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("lottery.pulled", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "lottery.pulled",
      source: "lottery",
      // amount = number of pulls in this batch (1 for single, N for multi).
      // Sum(amount) across a window gives total pulls — the core funnel metric.
      amount: p.count,
      eventData: {
        batchId: p.batchId,
        poolId: p.poolId,
        poolAlias: p.poolAlias,
        costItems: p.costItems,
        pityTriggeredCount: p.pityTriggeredCount,
        pulls: p.pulls,
      },
    });
  });
}
