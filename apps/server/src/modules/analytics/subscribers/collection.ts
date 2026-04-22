import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerCollectionSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("collection.entry_unlocked", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "collection.entry_unlocked",
      source: "collection",
      // amount = number of entries unlocked in this batch. A single item
      // grant can unlock multiple entries at once (cross-album hooks);
      // summing `amount` gives the total entries ever unlocked.
      amount: p.entryIds.length,
      eventData: {
        albumId: p.albumId,
        entryIds: p.entryIds,
        sourceTag: p.source,
      },
    });
  });

  events.on("collection.milestone_claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "collection.milestone_claimed",
      source: "collection",
      amount: 1,
      eventData: {
        albumId: p.albumId,
        milestoneId: p.milestoneId,
      },
    });
  });
}
