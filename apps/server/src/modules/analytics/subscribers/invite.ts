import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerInviteSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("invite.bound", (p) => {
    write({
      orgId: p.organizationId,
      // `endUserId` on the record represents the actor whose session
      // performed the write. For invite.bound that is the invitee
      // (`endUserId === inviteeEndUserId`), matching the convention that
      // the `end_user_id` column tags "whose session produced this row".
      endUserId: p.endUserId,
      event: "invite.bound",
      source: "invite",
      eventData: {
        inviterEndUserId: p.inviterEndUserId,
        inviteeEndUserId: p.inviteeEndUserId,
        code: p.code,
        boundAt: p.boundAt,
      },
    });
  });

  events.on("invite.qualified", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "invite.qualified",
      source: "invite",
      eventData: {
        inviterEndUserId: p.inviterEndUserId,
        inviteeEndUserId: p.inviteeEndUserId,
        qualifiedReason: p.qualifiedReason,
        qualifiedAt: p.qualifiedAt,
        boundAt: p.boundAt,
      },
    });
  });
}
