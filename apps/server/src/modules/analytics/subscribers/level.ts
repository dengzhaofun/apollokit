import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerLevelSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("level.cleared", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "level.cleared",
      source: "level",
      amount: p.stars,
      eventData: {
        configId: p.configId,
        levelId: p.levelId,
        bestScore: p.bestScore,
        firstClear: p.firstClear,
      },
    });
  });
}
