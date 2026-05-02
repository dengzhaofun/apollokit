/**
 * Runtime-facing analytics types.
 *
 * These are what business code passes into the writer — the writer
 * serializes / maps them to the on-disk Tinybird schema defined in
 * `src/lib/tinybird.ts`. Keep this shape stable; rename-resistant.
 */

export type AnalyticsActor =
  | "admin"
  | "end-user"
  | "cron"
  | "client-credential"
  | "anon";

export type AnalyticsOutcome = "ok" | "error" | "denied";

/**
 * A single Worker request, recorded automatically by
 * `src/middleware/request-log.ts`. No business meaning.
 */
export interface HttpRequestRecord {
  ts: Date;
  orgId: string;
  endUserId?: string;
  traceId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  country?: string;
  actor: AnalyticsActor;
  userAgent?: string;
}

/**
 * A domain event emitted via the existing `deps.events` bus and
 * forwarded to Tinybird by `src/modules/analytics/subscribers.ts`.
 *
 * `eventData` is arbitrary JSON — Tinybird stores it as a String
 * column and queries use `JSONExtract*()` to pull nested fields.
 * See docstring on `events` datasource in `src/lib/tinybird.ts`.
 */
export interface BusinessEventRecord {
  ts: Date;
  orgId: string;
  endUserId?: string;
  traceId: string;
  event: string;
  source: string;
  outcome?: AnalyticsOutcome;
  amount?: number;
  eventData?: Record<string, unknown>;
}

/**
 * Names of the pipes a tenant JWT may be scoped to. Kept as a
 * literal union so a typo is a compile error in the route that
 * signs the token.
 */
export type TenantPipeName =
  | "tenant_request_overview"
  | "tenant_event_counts"
  | "tenant_trace"
  | "tenant_event_names"
  | "tenant_event_timeseries"
  | "tenant_event_timeseries_fast"
  | "tenant_event_funnel"
  | "tenant_event_stream"
  | "experiment_metric_breakdown";
