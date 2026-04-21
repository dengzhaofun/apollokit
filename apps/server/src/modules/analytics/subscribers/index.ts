/**
 * Bridge: services emit domain events on `deps.events`, and this folder
 * translates them into Tinybird ingests.
 *
 * Services don't know Tinybird exists — they just `emit()`. To add a
 * new event type:
 *   1. Module augments `EventMap` in its own service.ts (see examples
 *      in `modules/activity/service.ts`, `modules/task/service.ts`).
 *   2. Call `deps.events.emit('<event>', payload)` after the primary
 *      write succeeds.
 *   3. Either:
 *      a) add / extend a subscriber file here and wire it below — use
 *         when the event IS also consumed by another business module
 *         (task progress, badge, notification, webhook, ...); OR
 *      b) if the event is purely observational and no business module
 *         consumes it, skip the event-bus entirely and call
 *         `deps.analytics.writer.logEvent(...)` directly from the
 *         service. event-bus is for cross-module broadcasts, not for
 *         data-analytics-only events. See `plans/server-tinybird-tidy-honey.md`.
 *
 * Failures are swallowed by the writer — a Tinybird outage never breaks
 * a business call.
 */

import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { registerActivitySubscribers } from "./activity";
import { registerAnnouncementSubscribers } from "./announcement";
import { registerAssistPoolSubscribers } from "./assist-pool";
import { registerExchangeSubscribers } from "./exchange";
import { registerFriendSubscribers } from "./friend";
import { registerFriendGiftSubscribers } from "./friend-gift";
import { registerGuildSubscribers } from "./guild";
import { registerInviteSubscribers } from "./invite";
import { registerLeaderboardSubscribers } from "./leaderboard";
import { registerLevelSubscribers } from "./level";
import { registerLotterySubscribers } from "./lottery";
import { registerRankSubscribers } from "./rank";
import { registerShopSubscribers } from "./shop";
import { registerTaskSubscribers } from "./task";

export function registerAnalyticsSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  registerTaskSubscribers(events, analytics);
  registerActivitySubscribers(events, analytics);
  registerLevelSubscribers(events, analytics);
  registerLeaderboardSubscribers(events, analytics);
  registerRankSubscribers(events, analytics);
  registerAnnouncementSubscribers(events, analytics);
  registerInviteSubscribers(events, analytics);
  registerAssistPoolSubscribers(events, analytics);
  // Phase 2a — commerce domain
  registerShopSubscribers(events, analytics);
  registerLotterySubscribers(events, analytics);
  registerExchangeSubscribers(events, analytics);
  // Phase 2b — social domain
  registerGuildSubscribers(events, analytics);
  registerFriendSubscribers(events, analytics);
  registerFriendGiftSubscribers(events, analytics);
}
