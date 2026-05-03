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
      orgId: p.tenantId,
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

  events.on("level.rewards_claimed", (p) => {
    write({
      orgId: p.tenantId,
      endUserId: p.endUserId,
      event: "level.rewards_claimed",
      source: "level",
      amount: 1,
      eventData: {
        levelId: p.levelId,
        type: p.type,
        starTier: p.starTier,
        grantedRewards: p.grantedRewards,
      },
    });
  });
}
