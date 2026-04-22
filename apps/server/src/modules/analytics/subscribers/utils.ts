/**
 * Shared helper for every `subscribers/<module>.ts` file: returns a
 * `write(partial)` function that auto-fills the two fields every
 * subscriber would otherwise copy-paste — `ts` (wall clock) and
 * `traceId` (pulled from the per-request ALS store).
 *
 * The returned `write` is deliberately NOT `async`. `writer.logEvent`
 * is fire-and-forget (swallows Tinybird failures internally), and we
 * don't want a slow ingest to block the event-bus fan-out. Event-bus
 * `emit()` awaits each handler serially, so if this blocked, every
 * other subscriber (future task-progress hooks, webhook fan-out) would
 * stall behind Tinybird.
 *
 * See the wider design in `plans/server-tinybird-tidy-honey.md`.
 */

import type { AnalyticsService } from "../../../lib/analytics";
import type { BusinessEventRecord } from "../../../lib/analytics/types";
import { getTraceId } from "../../../lib/request-context";

export type EventRecord = Omit<BusinessEventRecord, "ts" | "traceId">;

export type WriteEvent = (r: EventRecord) => void;

export function makeWriteEvent(analytics: AnalyticsService): WriteEvent {
  return (r) => {
    void analytics.writer.logEvent({
      ...r,
      ts: new Date(),
      traceId: getTraceId(),
    });
  };
}
