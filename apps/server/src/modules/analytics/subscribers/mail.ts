import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

/**
 * Note: `mail.read` is NOT subscribed here on purpose. That event is
 * emitted direct-to-writer inside `modules/mail/service.ts` because no
 * business module consumes it — it's pure observational data. Routing
 * it through event-bus would add indirection + type-map churn with zero
 * benefit. See `plans/server-tinybird-tidy-honey.md` for the "emit vs
 * direct writer" decision rule.
 */
export function registerMailSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("mail.claimed", (p) => {
    write({
      orgId: p.tenantId,
      endUserId: p.endUserId,
      event: "mail.claimed",
      source: "mail",
      amount: 1,
      eventData: {
        messageId: p.messageId,
        rewards: p.rewards,
      },
    });
  });
}
