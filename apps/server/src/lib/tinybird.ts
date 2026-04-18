/**
 * Tinybird definitions for apollokit.
 *
 * Two datasources:
 *   - http_requests : every Worker request (auto-logged by request-log middleware)
 *   - events        : business events (event + eventData JSON) via event-bus subscribers
 *
 * Three endpoints, all parameterized on org_id (injected via JWT fixed_params
 * by the /api/analytics/token route — tenants cannot query other tenants):
 *   - tenant_request_overview : request count / error count / p95 latency over time
 *   - tenant_event_counts     : event-type distribution
 *   - tenant_trace            : full event stream for a single trace_id
 *
 * Deploy: `pnpm --filter=server tb:build` (dev branch) / `pnpm --filter=server tb:deploy` (prod).
 */

import {
  defineDatasource,
  defineEndpoint,
  Tinybird,
  node,
  t,
  p,
  engine,
  type InferRow,
  type InferParams,
  type InferOutputRow,
} from "@tinybirdco/sdk";

// ============================================================================
// Datasources
// ============================================================================

/**
 * Every HTTP request the Worker serves. Written by
 * `src/middleware/request-log.ts`. Tenant queries filter by
 * `org_id` (= `session.activeOrganizationId`).
 */
export const httpRequests = defineDatasource("http_requests", {
  description: "apollokit Worker HTTP request log",
  schema: {
    timestamp: t.dateTime64(3),
    org_id: t.string(),
    end_user_id: t.string(),
    trace_id: t.string(),
    method: t.string().lowCardinality(),
    path: t.string(),
    status: t.uint16(),
    duration_ms: t.uint32(),
    country: t.string().lowCardinality(),
    actor: t.string().lowCardinality(),
    user_agent: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["org_id", "timestamp"],
    partitionKey: "toYYYYMM(timestamp)",
    ttl: "toDateTime(timestamp) + toIntervalDay(90)",
  }),
});

export type HttpRequestRow = InferRow<typeof httpRequests>;

/**
 * Business events. `event_data` is a JSON string (serialized at the
 * writer boundary) — Tinybird disallows ClickHouse's experimental
 * JSON type, so we store as String and query nested fields via
 * `JSONExtractString(event_data, 'rarity')` etc.
 *
 * Call sites live in `src/modules/analytics/subscribers.ts` —
 * services `events.emit(...)` and the subscriber translates to
 * `analytics.writer.logEvent(...)`.
 */
export const events = defineDatasource("events", {
  description: "apollokit business event stream (event + event_data JSON string)",
  schema: {
    timestamp: t.dateTime64(3),
    org_id: t.string(),
    end_user_id: t.string(),
    trace_id: t.string(),
    event: t.string().lowCardinality(),
    source: t.string().lowCardinality(),
    outcome: t.string().lowCardinality(),
    amount: t.float64(),
    event_data: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["org_id", "event", "timestamp"],
    partitionKey: "toYYYYMM(timestamp)",
    ttl: "toDateTime(timestamp) + toIntervalDay(180)",
  }),
});

export type EventRow = InferRow<typeof events>;

// ============================================================================
// Endpoints (all tenant-scoped — org_id is injected by backend-signed JWT)
// ============================================================================

/**
 * Bucketed request / error / p95 for a tenant's traffic.
 * `bucket_seconds` controls granularity (default 1h = 3600s;
 * pass 60 for minute, 86400 for day).
 */
export const tenantRequestOverview = defineEndpoint(
  "tenant_request_overview",
  {
    description:
      "Per-tenant HTTP traffic buckets: request count, errors, p95 latency",
    params: {
      org_id: p.string(),
      date_from: p.dateTime(),
      date_to: p.dateTime(),
      bucket_seconds: p.int32().optional(3600),
    },
    nodes: [
      node({
        name: "endpoint",
        sql: `
          SELECT
            toStartOfInterval(timestamp, INTERVAL {{Int32(bucket_seconds, 3600)}} SECOND) AS bucket,
            count()                                 AS requests,
            countIf(status >= 500)                  AS errors,
            quantile(0.95)(duration_ms)             AS p95_ms
          FROM http_requests
          WHERE org_id = {{String(org_id, '', required=True)}}
            AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                               AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
          GROUP BY bucket
          ORDER BY bucket
        `,
      }),
    ],
    output: {
      bucket: t.dateTime64(3),
      requests: t.uint64(),
      errors: t.uint64(),
      p95_ms: t.float64(),
    },
  },
);

export type TenantRequestOverviewParams = InferParams<
  typeof tenantRequestOverview
>;
export type TenantRequestOverviewOutput = InferOutputRow<
  typeof tenantRequestOverview
>;

/**
 * Event-type distribution for a tenant, optionally filtered to one event.
 */
export const tenantEventCounts = defineEndpoint("tenant_event_counts", {
  description: "Per-tenant event-type distribution with totals",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
    event: p.string().optional(""),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT
          event,
          count()      AS c,
          sum(amount)  AS total_amount
        FROM events
        WHERE org_id = {{String(org_id, '', required=True)}}
          AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                             AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
          {% if defined(event) and event != '' %}
          AND event = {{String(event)}}
          {% end %}
        GROUP BY event
        ORDER BY c DESC
      `,
    }),
  ],
  output: {
    event: t.string(),
    c: t.uint64(),
    total_amount: t.float64(),
  },
});

export type TenantEventCountsParams = InferParams<typeof tenantEventCounts>;
export type TenantEventCountsOutput = InferOutputRow<typeof tenantEventCounts>;

/**
 * Full event stream for one trace_id — powers the per-request
 * waterfall in the admin UI.
 */
export const tenantTrace = defineEndpoint("tenant_trace", {
  description: "Event stream for a single trace_id (per-request waterfall)",
  params: {
    org_id: p.string(),
    trace_id: p.string(),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT
          timestamp,
          event,
          source,
          outcome,
          amount,
          end_user_id,
          event_data
        FROM events
        WHERE org_id   = {{String(org_id,   '', required=True)}}
          AND trace_id = {{String(trace_id, '', required=True)}}
        ORDER BY timestamp
      `,
    }),
  ],
  output: {
    timestamp: t.dateTime64(3),
    event: t.string(),
    source: t.string(),
    outcome: t.string(),
    amount: t.float64(),
    end_user_id: t.string(),
    event_data: t.string(),
  },
});

export type TenantTraceParams = InferParams<typeof tenantTrace>;
export type TenantTraceOutput = InferOutputRow<typeof tenantTrace>;

// ============================================================================
// Client factory
// ============================================================================

// Workers runtime has no `process.env`, so we never construct a module-level
// Tinybird instance — the factory is called once per isolate from
// `src/lib/analytics/index.ts` with `env.TINYBIRD_TOKEN` / `env.TINYBIRD_URL`.
export const tinybirdResources = {
  datasources: { httpRequests, events },
  pipes: { tenantRequestOverview, tenantEventCounts, tenantTrace },
} as const;

export function createTinybirdClient(opts: { token: string; baseUrl: string }) {
  return new Tinybird({
    ...tinybirdResources,
    token: opts.token,
    baseUrl: opts.baseUrl,
  });
}

export type TinybirdClient = ReturnType<typeof createTinybirdClient>;
