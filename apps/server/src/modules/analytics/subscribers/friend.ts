import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerFriendSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("friend.request_sent", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "friend.request_sent",
      source: "friend",
      amount: 1,
      eventData: {
        requestId: p.requestId,
        toUserId: p.toUserId,
      },
    });
  });

  events.on("friend.request_accepted", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "friend.request_accepted",
      source: "friend",
      amount: 1,
      eventData: {
        requestId: p.requestId,
        fromUserId: p.fromUserId,
      },
    });
  });
}
