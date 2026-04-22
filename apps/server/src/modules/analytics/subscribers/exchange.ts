import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerExchangeSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("exchange.executed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "exchange.executed",
      source: "exchange",
      amount: 1,
      eventData: {
        exchangeId: p.exchangeId,
        optionId: p.optionId,
        configId: p.configId,
        configAlias: p.configAlias,
        costItems: p.costItems,
        rewardItems: p.rewardItems,
      },
    });
  });
}
