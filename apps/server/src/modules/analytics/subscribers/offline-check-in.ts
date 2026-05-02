/**
 * Tinybird subscriber for offline-check-in events.
 *
 * Three event types fire from `modules/offline-check-in/service.ts`:
 *
 *   - `offline_check_in.attempted`  — every attempt (success OR rejection).
 *     Drives the spot-level funnel and anti-fraud heatmap.
 *   - `offline_check_in.completed`  — accepted attempts only. Drives the
 *     "spot completion heatmap" + per-spot completion timing.
 *   - `offline_check_in.campaign_completed` — fires once per (campaign,
 *     endUser) when the completion rule is met. Drives the funnel.
 *
 * Stamp-album milestone grants are NOT mirrored here — `collection`
 * already emits its own `collection.milestone_claimed` event which is
 * picked up by `subscribers/collection.ts`.
 */

import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerOfflineCheckInSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("offline_check_in.attempted", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "offline_check_in.attempted",
      source: "offline-check-in",
      // amount = 1 if accepted, 0 if rejected — sum() gives accepted count,
      // count() gives total attempts, ratio = conversion.
      amount: p.accepted ? 1 : 0,
      eventData: {
        campaignId: p.campaignId,
        spotId: p.spotId,
        accepted: p.accepted,
        rejectReason: p.rejectReason,
        verifiedVia: p.verifiedVia,
        lat: p.lat,
        lng: p.lng,
        accuracyM: p.accuracyM,
        distanceM: p.distanceM,
        country: p.country,
      },
    });
  });

  events.on("offline_check_in.completed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "offline_check_in.completed",
      source: "offline-check-in",
      amount: 1,
      eventData: {
        campaignId: p.campaignId,
        spotId: p.spotId,
        lat: p.lat,
        lng: p.lng,
        distanceM: p.distanceM,
      },
    });
  });

  events.on("offline_check_in.campaign_completed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "offline_check_in.campaign_completed",
      source: "offline-check-in",
      amount: p.totalCount,
      eventData: {
        campaignId: p.campaignId,
        totalCount: p.totalCount,
      },
    });
  });
}
