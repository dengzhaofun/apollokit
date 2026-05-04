/**
 * Tinybird definitions for apollokit.
 *
 * Two datasources:
 *   - http_requests : every Worker request (auto-logged by request-log middleware)
 *   - events        : business events (event + eventData JSON) via event-bus subscribers
 *
 * Endpoints, all parameterized on org_id (injected via JWT fixed_params
 * by the /api/v1/analytics/token route — tenants cannot query other tenants):
 *   - tenant_request_overview  : request count / error count / p95 latency over time
 *   - tenant_event_counts      : event-type distribution
 *   - tenant_trace             : full event stream for a single trace_id
 *   - tenant_event_names       : DISTINCT event names a tenant has actually emitted
 *   - tenant_event_timeseries  : custom analysis (event × time × groupBy × filters)
 *   - tenant_event_funnel      : windowFunnel-based 2-5 step funnel
 *   - tenant_event_stream      : timestamp-DESC event stream with cursor pagination
 *
 * Deploy: `pnpm --filter=server tb:build` (dev branch) / `pnpm --filter=server tb:deploy` (prod).
 */

import {
  defineDatasource,
  defineEndpoint,
  defineMaterializedView,
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

/**
 * Hourly pre-aggregation of `events` keyed by the **fixed** dimensions
 * (org / event / source / outcome). Powers the "fast path" for the
 * explore page when the user picks hour-or-coarser buckets and a
 * groupBy that lives in this set.
 *
 * What we store:
 *   - `event_count` — SimpleAggregateFunction(sum, UInt64). Each
 *     materialized insert writes `count()` for that bucket; the engine
 *     sums across late-arriving rows that fall in the same bucket.
 *   - `amount_sum` — SimpleAggregateFunction(sum, Float64).
 *   - `users_state` — AggregateFunction(uniq, String). Stores the
 *     HyperLogLog state for `uniq(end_user_id)`; query side calls
 *     `uniqMerge(users_state)` to get the final unique count. We can't
 *     just store an integer here — counting uniques across hourly
 *     buckets needs the underlying state, otherwise summing per-hour
 *     counts double-counts users active in multiple hours.
 *
 * What we DON'T store (still needs the raw `events` table):
 *   - `end_user_id` as a groupBy dimension (high cardinality, would
 *     defeat the agg)
 *   - `event_data` JSON anything — pre-aggregating arbitrary JSON
 *     paths is impossible without enumerating them
 *
 * Sorting key prefix: `[org_id, event, hour]` matches the read path
 * (WHERE org_id + event + time range), so partition-pruning + index
 * skipping take care of the hot path.
 */
export const eventsHourlyAgg = defineDatasource("events_hourly_agg", {
  description:
    "Hourly pre-agg of events by (org, event, source, outcome) — fast path for explore page when bucket >= 1h",
  // Disable auto JSON paths — Tinybird rejects datasources that mix
  // AggregateFunction columns with JSONPath metadata (the latter is
  // for NDJSON ingest, doesn't apply to materialized views).
  jsonPaths: false,
  schema: {
    hour: t.dateTime(),
    org_id: t.string(),
    event: t.string().lowCardinality(),
    source: t.string().lowCardinality(),
    outcome: t.string().lowCardinality(),
    event_count: t.simpleAggregateFunction("sum", t.uint64()),
    amount_sum: t.simpleAggregateFunction("sum", t.float64()),
    users_state: t.aggregateFunction("uniq", t.string()),
  },
  engine: engine.aggregatingMergeTree({
    sortingKey: ["org_id", "event", "hour", "source", "outcome"],
    partitionKey: "toYYYYMM(hour)",
    ttl: "toDateTime(hour) + toIntervalDay(180)",
  }),
});

export type EventsHourlyAggRow = InferRow<typeof eventsHourlyAgg>;

/**
 * Materialized pipe — runs on every insert into `events`, maintains
 * `events_hourly_agg`. There's no `WHERE org_id = ...` here on purpose:
 * one matview shared across all tenants, query-side filtering still
 * happens via the JWT `fixed_params.org_id` on the read pipe.
 */
export const eventsToHourlyAgg = defineMaterializedView("events_to_hourly_agg", {
  description:
    "Maintains events_hourly_agg from incoming events for the explore-page fast path",
  datasource: eventsHourlyAgg,
  nodes: [
    node({
      name: "transform",
      sql: `
        SELECT
          toStartOfHour(timestamp)  AS hour,
          org_id,
          event,
          source,
          outcome,
          count()                   AS event_count,
          sum(amount)               AS amount_sum,
          uniqState(end_user_id)    AS users_state
        FROM events
        GROUP BY hour, org_id, event, source, outcome
      `,
    }),
  ],
});

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

/**
 * DISTINCT event names a tenant has actually emitted in a window, with counts.
 * Powers the event-name combobox on the explore / activity pages so users
 * see *real* events instead of a static registry list.
 */
export const tenantEventNames = defineEndpoint("tenant_event_names", {
  description:
    "Distinct event names a tenant has emitted in a time window, with counts.",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT event, count() AS c
        FROM events
        WHERE org_id = {{String(org_id, '', required=True)}}
          AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                             AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
        GROUP BY event
        ORDER BY c DESC
        LIMIT 500
      `,
    }),
  ],
  output: {
    event: t.string(),
    c: t.uint64(),
  },
});

export type TenantEventNamesParams = InferParams<typeof tenantEventNames>;
export type TenantEventNamesOutput = InferOutputRow<typeof tenantEventNames>;

/**
 * Custom event analysis — bucketed counts/sums/uniques for a single event
 * with optional groupBy on a top-level column (or a single-key JSON path)
 * and optional top-level / JSON-path filters.
 *
 * `group_by` only accepts a fixed enum (`source` | `outcome` | `event` |
 * `end_user_id` | `json`); the SQL branches on its value, so users cannot
 * inject an arbitrary column name. When `group_by='json'`, `json_path_group`
 * is passed to `JSONExtractString` as a *string value* (templating escapes
 * it) — it is never treated as a column.
 */
export const tenantEventTimeseries = defineEndpoint("tenant_event_timeseries", {
  description:
    "Per-tenant single-event time series with optional groupBy (top-level or JSON) and filters.",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
    event: p.string(),
    bucket_seconds: p.int32().optional(3600),
    group_by: p.string().optional(""),
    source: p.string().optional(""),
    outcome: p.string().optional(""),
    end_user_id: p.string().optional(""),
    json_path_group: p.string().optional(""),
    json_path_filter: p.string().optional(""),
    json_value_filter: p.string().optional(""),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT
          toStartOfInterval(timestamp, INTERVAL {{Int32(bucket_seconds, 3600)}} SECOND) AS bucket,
          {% if defined(group_by) and group_by == 'source' %}
            source AS dim,
          {% elif defined(group_by) and group_by == 'outcome' %}
            outcome AS dim,
          {% elif defined(group_by) and group_by == 'event' %}
            event AS dim,
          {% elif defined(group_by) and group_by == 'end_user_id' %}
            end_user_id AS dim,
          {% elif defined(group_by) and group_by == 'json' and defined(json_path_group) and json_path_group != '' %}
            JSONExtractString(event_data, {{String(json_path_group)}}) AS dim,
          {% else %}
            '' AS dim,
          {% end %}
          count()                AS c,
          sum(amount)            AS total_amount,
          uniqExact(end_user_id) AS uniq_users
        FROM events
        WHERE org_id = {{String(org_id, '', required=True)}}
          AND event  = {{String(event, '', required=True)}}
          AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                             AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
          {% if defined(source)      and source      != '' %} AND source      = {{String(source)}}      {% end %}
          {% if defined(outcome)     and outcome     != '' %} AND outcome     = {{String(outcome)}}     {% end %}
          {% if defined(end_user_id) and end_user_id != '' %} AND end_user_id = {{String(end_user_id)}} {% end %}
          {% if defined(json_path_filter) and json_path_filter != '' and defined(json_value_filter) and json_value_filter != '' %}
            AND JSONExtractString(event_data, {{String(json_path_filter)}}) = {{String(json_value_filter)}}
          {% end %}
        GROUP BY bucket, dim
        ORDER BY bucket, c DESC
      `,
    }),
  ],
  output: {
    bucket: t.dateTime64(3),
    dim: t.string(),
    c: t.uint64(),
    total_amount: t.float64(),
    uniq_users: t.uint64(),
  },
});

export type TenantEventTimeseriesParams = InferParams<
  typeof tenantEventTimeseries
>;
export type TenantEventTimeseriesOutput = InferOutputRow<
  typeof tenantEventTimeseries
>;

/**
 * Funnel analysis. Up to 5 steps; each step is an event-name equality.
 * Implemented with ClickHouse `windowFunnel` — `reached` is the longest
 * matching prefix length per user, then we expand to per-step user counts
 * via `ARRAY JOIN [1..5]` and trim to the actually-supplied step count.
 *
 * `end_user_id != ''` excludes anonymous server-side events that would
 * otherwise all collapse to a single empty-string "user".
 */
export const tenantEventFunnel = defineEndpoint("tenant_event_funnel", {
  description:
    "Per-tenant 2-5 step funnel via windowFunnel; returns per-step user counts.",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
    window_seconds: p.int32().optional(86400),
    step1: p.string(),
    step2: p.string().optional(""),
    step3: p.string().optional(""),
    step4: p.string().optional(""),
    step5: p.string().optional(""),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        WITH funnel AS (
          SELECT
            end_user_id,
            windowFunnel({{Int32(window_seconds, 86400)}})(
              toDateTime(timestamp),
              event = {{String(step1, '', required=True)}}
              {% if defined(step2) and step2 != '' %}, event = {{String(step2)}} {% end %}
              {% if defined(step3) and step3 != '' %}, event = {{String(step3)}} {% end %}
              {% if defined(step4) and step4 != '' %}, event = {{String(step4)}} {% end %}
              {% if defined(step5) and step5 != '' %}, event = {{String(step5)}} {% end %}
            ) AS reached
          FROM events
          WHERE org_id = {{String(org_id, '', required=True)}}
            AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                               AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
            AND event IN (
              {{String(step1, '', required=True)}}
              {% if defined(step2) and step2 != '' %}, {{String(step2)}} {% end %}
              {% if defined(step3) and step3 != '' %}, {{String(step3)}} {% end %}
              {% if defined(step4) and step4 != '' %}, {{String(step4)}} {% end %}
              {% if defined(step5) and step5 != '' %}, {{String(step5)}} {% end %}
            )
            AND end_user_id != ''
          GROUP BY end_user_id
        )
        SELECT level AS step, countIf(reached >= level) AS users
        FROM funnel
        ARRAY JOIN [1, 2, 3, 4, 5] AS level
        WHERE level <= (
          1
          {% if defined(step2) and step2 != '' %} + 1 {% end %}
          {% if defined(step3) and step3 != '' %} + 1 {% end %}
          {% if defined(step4) and step4 != '' %} + 1 {% end %}
          {% if defined(step5) and step5 != '' %} + 1 {% end %}
        )
        GROUP BY step
        ORDER BY step
      `,
    }),
  ],
  output: {
    step: t.uint8(),
    users: t.uint64(),
  },
});

export type TenantEventFunnelParams = InferParams<typeof tenantEventFunnel>;
export type TenantEventFunnelOutput = InferOutputRow<typeof tenantEventFunnel>;

/**
 * Raw event stream with timestamp-DESC ordering and cursor pagination.
 * The frontend hands the last row's timestamp back as `before_ts` to fetch
 * the next page. Limit is capped at 500 server-side; the admin UI also
 * caps it client-side as defence-in-depth.
 */
export const tenantEventStream = defineEndpoint("tenant_event_stream", {
  description:
    "Per-tenant raw event stream, timestamp-DESC, cursor-paginated via before_ts.",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
    event: p.string().optional(""),
    source: p.string().optional(""),
    outcome: p.string().optional(""),
    end_user_id: p.string().optional(""),
    json_path_filter: p.string().optional(""),
    json_value_filter: p.string().optional(""),
    limit: p.int32().optional(100),
    before_ts: p.string().optional(""),
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
          trace_id,
          event_data
        FROM events
        WHERE org_id = {{String(org_id, '', required=True)}}
          AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                             AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
          {% if defined(event)       and event       != '' %} AND event       = {{String(event)}}       {% end %}
          {% if defined(source)      and source      != '' %} AND source      = {{String(source)}}      {% end %}
          {% if defined(outcome)     and outcome     != '' %} AND outcome     = {{String(outcome)}}     {% end %}
          {% if defined(end_user_id) and end_user_id != '' %} AND end_user_id = {{String(end_user_id)}} {% end %}
          {% if defined(json_path_filter) and json_path_filter != '' and defined(json_value_filter) and json_value_filter != '' %}
            AND JSONExtractString(event_data, {{String(json_path_filter)}}) = {{String(json_value_filter)}}
          {% end %}
          {% if defined(before_ts)   and before_ts   != '' %}
            AND timestamp < parseDateTimeBestEffort({{String(before_ts)}})
          {% end %}
        ORDER BY timestamp DESC
        LIMIT {{Int32(limit, 100)}}
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
    trace_id: t.string(),
    event_data: t.string(),
  },
});

export type TenantEventStreamParams = InferParams<typeof tenantEventStream>;
export type TenantEventStreamOutput = InferOutputRow<typeof tenantEventStream>;

/**
 * v1.5 — Experiment metric breakdown for the decision panel.
 *
 * For each variant of an experiment, returns exposed_users +
 * converted_users + event_count over a (configurable) per-user
 * conversion window starting at first exposure.
 *
 * Semantics:
 *   - **exposed_users**: distinct end_user_ids whose first
 *     `experiment.exposure` event for this experiment fell inside
 *     [date_from, date_to].
 *   - **converted_users**: subset of those whose `metric_event` fired
 *     at least once in [first_exposed_at, first_exposed_at +
 *     window_days].
 *   - **event_count**: total `metric_event` count from the same users
 *     in the same per-user window.
 *
 * Optional filter on the conversion event: a single flat
 * `JSONExtractString(event_data, json_path_filter) = json_value_filter`
 * check. v1.5 only supports flat equality — the admin form restricts
 * to that shape; richer JSONLogic-on-conversion-events lands in v2.
 *
 * Why "first_exposed_at + window_days" instead of just date_to:
 * standard A/B-testing practice locks conversion windows per user
 * from their assignment moment. Otherwise users assigned late in
 * the analysis window get unfairly less conversion time.
 */
export const experimentMetricBreakdown = defineEndpoint(
  "experiment_metric_breakdown",
  {
    description:
      "Per-variant exposure + conversion counts for an experiment's primary metric.",
    params: {
      org_id: p.string(),
      experiment_id: p.string(),
      metric_event: p.string(),
      date_from: p.dateTime(),
      date_to: p.dateTime(),
      window_days: p.int32().optional(7),
      json_path_filter: p.string().optional(""),
      json_value_filter: p.string().optional(""),
    },
    nodes: [
      node({
        name: "endpoint",
        sql: `
          WITH exposures AS (
            SELECT
              JSONExtractString(event_data, 'variant_key') AS variant_key,
              end_user_id,
              min(timestamp) AS exposed_at
            FROM events
            WHERE org_id = {{String(org_id, '', required=True)}}
              AND event = 'experiment.exposure'
              AND JSONExtractString(event_data, 'experiment_id') = {{String(experiment_id, '', required=True)}}
              AND timestamp BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                                 AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
              AND end_user_id != ''
            GROUP BY variant_key, end_user_id
          ),
          conversions AS (
            SELECT
              end_user_id,
              timestamp,
              event_data
            FROM events
            WHERE org_id = {{String(org_id, '', required=True)}}
              AND event = {{String(metric_event, '', required=True)}}
              AND end_user_id != ''
              {% if defined(json_path_filter) and json_path_filter != '' %}
              AND JSONExtractString(event_data, {{String(json_path_filter)}}) = {{String(json_value_filter)}}
              {% end %}
          ),
          joined AS (
            SELECT
              e.variant_key,
              e.end_user_id,
              countIf(
                c.timestamp >= e.exposed_at
                AND c.timestamp <= e.exposed_at + INTERVAL {{Int32(window_days, 7)}} DAY
              ) AS evts_in_window
            FROM exposures e
            LEFT JOIN conversions c USING (end_user_id)
            GROUP BY e.variant_key, e.end_user_id
          )
          SELECT
            variant_key,
            count() AS exposed_users,
            countIf(evts_in_window > 0) AS converted_users,
            sum(evts_in_window)         AS event_count
          FROM joined
          GROUP BY variant_key
          ORDER BY variant_key
        `,
      }),
    ],
    output: {
      variant_key: t.string(),
      exposed_users: t.uint64(),
      converted_users: t.uint64(),
      event_count: t.uint64(),
    },
  },
);

export type ExperimentMetricBreakdownParams = InferParams<
  typeof experimentMetricBreakdown
>;
export type ExperimentMetricBreakdownOutput = InferOutputRow<
  typeof experimentMetricBreakdown
>;

/**
 * Fast-path companion of `tenant_event_timeseries`. Reads from the
 * pre-aggregated `events_hourly_agg` instead of the raw `events`
 * datasource.
 *
 * Constraints (admin hook routes here only when *all* hold):
 *   - `bucket_seconds` is a multiple of 3600 (hour or day; minute-level
 *     can't use this aggregate)
 *   - `group_by` ∈ {'', 'source', 'outcome', 'event'}
 *     (NO 'end_user_id' — high cardinality would defeat the agg;
 *      NO 'json' — arbitrary JSON paths can't be pre-materialized)
 *   - No `end_user_id` filter (same reason)
 *   - No JSON path filter (same reason)
 *
 * Wins on a 30-day window with 1h buckets: ~100× fewer rows scanned,
 * ~10-30× lower latency. Frontend silently falls back to the slow
 * `tenant_event_timeseries` for the unsupported cases.
 */
export const tenantEventTimeseriesFast = defineEndpoint(
  "tenant_event_timeseries_fast",
  {
    description:
      "Fast-path event timeseries reading from events_hourly_agg (hour+ buckets, fixed dims only)",
    params: {
      org_id: p.string(),
      date_from: p.dateTime(),
      date_to: p.dateTime(),
      event: p.string(),
      bucket_seconds: p.int32().optional(3600),
      group_by: p.string().optional(""),
      source: p.string().optional(""),
      outcome: p.string().optional(""),
    },
    nodes: [
      node({
        name: "endpoint",
        sql: `
          SELECT
            toStartOfInterval(hour, INTERVAL {{Int32(bucket_seconds, 3600)}} SECOND) AS bucket,
            {% if defined(group_by) and group_by == 'source' %}
              source AS dim,
            {% elif defined(group_by) and group_by == 'outcome' %}
              outcome AS dim,
            {% elif defined(group_by) and group_by == 'event' %}
              event AS dim,
            {% else %}
              '' AS dim,
            {% end %}
            sum(event_count)        AS c,
            sum(amount_sum)         AS total_amount,
            uniqMerge(users_state)  AS uniq_users
          FROM events_hourly_agg
          WHERE org_id = {{String(org_id, '', required=True)}}
            AND event  = {{String(event, '', required=True)}}
            AND hour BETWEEN parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
                          AND parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
            {% if defined(source)  and source  != '' %} AND source  = {{String(source)}}  {% end %}
            {% if defined(outcome) and outcome != '' %} AND outcome = {{String(outcome)}} {% end %}
          GROUP BY bucket, dim
          ORDER BY bucket, c DESC
        `,
      }),
    ],
    output: {
      bucket: t.dateTime(),
      dim: t.string(),
      c: t.uint64(),
      total_amount: t.float64(),
      uniq_users: t.uint64(),
    },
  },
);

export type TenantEventTimeseriesFastParams = InferParams<
  typeof tenantEventTimeseriesFast
>;
export type TenantEventTimeseriesFastOutput = InferOutputRow<
  typeof tenantEventTimeseriesFast
>;

/**
 * MAU reconcile path. Counts unique `end_user_id`s active for an
 * organization in a given month, optionally bucketed per `path`
 * prefix to spot which surfaces drove the activity. NOT used on
 * the hot path — `mau_active_player` (Postgres) is the source of
 * truth for billing. This pipe exists for two reasons:
 *
 *   - Reconciliation: ops can compare the Tinybird-derived count
 *     against the PG count to spot tracker failures.
 *   - Backfill: if `mau_active_player` is corrupted or wiped, this
 *     is the canonical recovery query.
 *
 * Reads from `events` (broadest signal — any time we ingest an
 * event tagged with `end_user_id`, that counts as activity). The
 * end-user id stamping happens at the writer boundary already
 * (see `request-log.ts` and analytics subscribers).
 */
export const tenantMauBreakdown = defineEndpoint("tenant_mau_breakdown", {
  description:
    "Per-org unique end_user_ids in [date_from, date_to). Reconcile / backfill path for MAU billing.",
  params: {
    org_id: p.string(),
    date_from: p.dateTime(),
    date_to: p.dateTime(),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT
          uniqExact(end_user_id) AS mau,
          count()                AS total_events
        FROM events
        WHERE org_id = {{String(org_id, '', required=True)}}
          AND end_user_id != ''
          AND timestamp >= parseDateTimeBestEffort({{String(date_from, '1970-01-01T00:00:00Z', required=True)}})
          AND timestamp <  parseDateTimeBestEffort({{String(date_to,   '2099-12-31T23:59:59Z', required=True)}})
      `,
    }),
  ],
  output: {
    mau: t.uint64(),
    total_events: t.uint64(),
  },
});

export type TenantMauBreakdownParams = InferParams<typeof tenantMauBreakdown>;
export type TenantMauBreakdownOutput = InferOutputRow<typeof tenantMauBreakdown>;

// ============================================================================
// Client factory
// ============================================================================

// Workers runtime has no `process.env`, so we never construct a module-level
// Tinybird instance — the factory is called once per isolate from
// `src/lib/analytics/index.ts` with `env.TINYBIRD_TOKEN` / `env.TINYBIRD_URL`.
export const tinybirdResources = {
  datasources: { httpRequests, events, eventsHourlyAgg },
  pipes: {
    tenantRequestOverview,
    tenantEventCounts,
    tenantTrace,
    tenantEventNames,
    tenantEventTimeseries,
    tenantEventTimeseriesFast,
    tenantEventFunnel,
    tenantEventStream,
    eventsToHourlyAgg,
    experimentMetricBreakdown,
    tenantMauBreakdown,
  },
} as const;

export function createTinybirdClient(opts: { token: string; baseUrl: string }) {
  return new Tinybird({
    ...tinybirdResources,
    token: opts.token,
    baseUrl: opts.baseUrl,
    // SDK auto-derives `devMode` from `NODE_ENV === "development"` (see
    // `@tinybirdco/sdk/src/schema/project.ts`). In dev mode it tries to
    // load `tinybird.config.mjs` from disk to resolve a per-branch token —
    // which only works for the CLI. The Workers runtime has no filesystem
    // access for that dynamic import, so wrangler dev would 500 on every
    // ingest. Branch routing belongs to `pnpm tb:deploy`; the live token
    // already points at the right workspace via env vars.
    devMode: false,
  });
}

export type TinybirdClient = ReturnType<typeof createTinybirdClient>;
