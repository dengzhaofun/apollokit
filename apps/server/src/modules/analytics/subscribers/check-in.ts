import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerCheckInSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("check_in.completed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "check_in.completed",
      source: "check-in",
      // amount = current streak so sum-windows give streak-weighted stats
      // while simple count(event='check_in.completed') still gives raw
      // check-ins per day (since each emit is one check-in).
      amount: p.streak,
      eventData: {
        configId: p.configId,
        cycleKey: p.cycleKey,
        dateKey: p.dateKey,
        cycleDays: p.cycleDays,
        justCompletedCycle: p.justCompletedCycle,
        rewards: p.rewards,
      },
    });
  });
}
