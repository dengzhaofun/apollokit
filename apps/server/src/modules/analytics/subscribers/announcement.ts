import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerAnnouncementSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("announcement.created", (p) => {
    write({
      orgId: p.organizationId,
      event: "announcement.created",
      source: "announcement",
      eventData: {
        announcementId: p.announcementId,
        alias: p.alias,
        kind: p.kind,
      },
    });
  });

  events.on("announcement.updated", (p) => {
    write({
      orgId: p.organizationId,
      event: "announcement.updated",
      source: "announcement",
      eventData: {
        announcementId: p.announcementId,
        alias: p.alias,
      },
    });
  });

  events.on("announcement.deleted", (p) => {
    write({
      orgId: p.organizationId,
      event: "announcement.deleted",
      source: "announcement",
      eventData: {
        announcementId: p.announcementId,
        alias: p.alias,
      },
    });
  });

  events.on("announcement.impression", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "announcement.impression",
      source: "announcement",
      amount: 1,
      eventData: {
        announcementId: p.announcementId,
        alias: p.alias,
        kind: p.kind,
      },
    });
  });

  events.on("announcement.click", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "announcement.click",
      source: "announcement",
      amount: 1,
      eventData: {
        announcementId: p.announcementId,
        alias: p.alias,
        ctaUrl: p.ctaUrl,
      },
    });
  });
}
