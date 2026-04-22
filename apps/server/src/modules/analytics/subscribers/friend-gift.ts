import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerFriendGiftSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("friend_gift.sent", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "friend_gift.sent",
      source: "friend-gift",
      amount: 1,
      eventData: {
        sendId: p.sendId,
        receiverUserId: p.receiverUserId,
        packageId: p.packageId,
      },
    });
  });

  events.on("friend_gift.claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "friend_gift.claimed",
      source: "friend-gift",
      amount: 1,
      eventData: {
        sendId: p.sendId,
        senderUserId: p.senderUserId,
      },
    });
  });
}
