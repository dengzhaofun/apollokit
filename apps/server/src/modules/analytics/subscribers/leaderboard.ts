import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerLeaderboardSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("leaderboard.contributed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "leaderboard.contributed",
      source: "leaderboard",
      // `applied` is the delta actually written to the zset after policy
      // filtering; `value` is what the caller proposed. Analytics cares
      // about what landed, so that's the `amount`; `value` stays in
      // eventData for "intent vs applied" analysis.
      amount: p.applied,
      eventData: {
        metricKey: p.metricKey,
        value: p.value,
      },
    });
  });
}
