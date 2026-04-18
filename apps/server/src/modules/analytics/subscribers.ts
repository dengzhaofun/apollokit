/**
 * Bridge: services emit domain events on `deps.events`, and this
 * module translates them into Tinybird ingests.
 *
 * Services don't know Tinybird exists — they just `emit()`. To add a
 * new event type:
 *   1. Module augments `EventMap` in its own file (see examples in
 *      `modules/activity/service.ts`).
 *   2. Call `deps.events.emit('<event>', payload)` after the primary
 *      write succeeds.
 *   3. Add a one-liner subscriber below.
 *
 * Failures are swallowed — the writer catches them.
 */

import type { AnalyticsService } from "../../lib/analytics";
import type { EventBus } from "../../lib/event-bus";

export function registerAnalyticsSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  // TODO: wire concrete subscribers as services start emitting.
  // Pattern (keep comments inline so future contributors copy):
  //
  //   events.on('check_in.completed', (p) => {
  //     void analytics.writer.logEvent({
  //       ts: new Date(),
  //       orgId: p.organizationId,
  //       endUserId: p.endUserId,
  //       traceId: p.traceId,
  //       event: 'check_in.completed',
  //       source: 'check-in',
  //       amount: p.reward,
  //       eventData: { cycleKey: p.cycleKey, streak: p.streak },
  //     })
  //   })
  //
  // The unused-param suppressors keep the lint clean until the first
  // real subscriber lands.
  void events;
  void analytics;
}
