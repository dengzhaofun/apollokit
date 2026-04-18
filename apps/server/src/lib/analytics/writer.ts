/**
 * Writer that adapts our domain records (`HttpRequestRecord`,
 * `BusinessEventRecord`) to the typed Tinybird SDK shape declared
 * in `src/lib/tinybird.ts`.
 *
 * `.ingest()` is `await`-able but we treat writes as fire-and-forget
 * — callers wrap in `c.executionCtx.waitUntil(...)` to not block the
 * request, and the writer itself catches + logs failures so a
 * Tinybird outage doesn't break the Worker.
 */

import type { TinybirdClient } from "../tinybird";
import type { HttpRequestRecord, BusinessEventRecord } from "./types";

export interface AnalyticsWriter {
  logHttp(r: HttpRequestRecord): Promise<void>;
  logEvent(r: BusinessEventRecord): Promise<void>;
}

// Tinybird's wire format is ISO 8601 or ClickHouse DateTime64
// ("YYYY-MM-DD HH:MM:SS.SSS"). ISO is accepted for DateTime64(3)
// so we stay with `toISOString()` for uniformity.
function formatTs(d: Date): string {
  return d.toISOString();
}

// Clamp user agent to a sane size — Tinybird has a per-event body
// ceiling and UA strings are the worst offender.
function clampUserAgent(ua: string | undefined): string {
  if (!ua) return "";
  return ua.length > 256 ? ua.slice(0, 256) : ua;
}

export function createAnalyticsWriter(
  client: TinybirdClient,
): AnalyticsWriter {
  return {
    async logHttp(r) {
      try {
        await client.httpRequests.ingest({
          timestamp: formatTs(r.ts),
          org_id: r.orgId,
          end_user_id: r.endUserId ?? "",
          trace_id: r.traceId,
          method: r.method,
          path: r.path,
          status: r.status,
          duration_ms: r.durationMs,
          country: r.country ?? "",
          actor: r.actor,
          user_agent: clampUserAgent(r.userAgent),
        });
      } catch (err) {
        console.error("[analytics.logHttp] failed:", err);
      }
    },

    async logEvent(r) {
      try {
        await client.events.ingest({
          timestamp: formatTs(r.ts),
          org_id: r.orgId,
          end_user_id: r.endUserId ?? "",
          trace_id: r.traceId,
          event: r.event,
          source: r.source,
          outcome: r.outcome ?? "ok",
          amount: r.amount ?? 0,
          event_data: JSON.stringify(r.eventData ?? {}),
        });
      } catch (err) {
        console.error("[analytics.logEvent] failed:", err);
      }
    },
  };
}
