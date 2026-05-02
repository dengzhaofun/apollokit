/**
 * Tinybird 前端接入 — JWT + fetch + React Query。
 *
 * 设计参考 game-saas-jaunty-dahl.md 的"Tinybird 前端接入方案"节,要点:
 *   1. 后端 `POST /api/analytics/token` 签发短 TTL JWT,JWT 里用 `fixed_params.org_id`
 *      做租户隔离 —— 前端即使手动拼 URL query 也改不了 Tinybird 端的 org_id 过滤。
 *   2. 前端用 React Query 缓存 token(按 pipe 组合 + activeOrgId 做 key),
 *      9 分钟后自动重新签发,避开 600s 过期边界。
 *   3. 单次查询 hook `useTinybirdQuery(pipe, params)` 直接打 Tinybird CDN
 *      (`{baseUrl}/{pipe}.json?<params>&token=<jwt>`),绕过后端,延迟最低。
 *   4. 所有 queryKey 都包含 `activeOrganizationId`,租户切换时自动失效、重查。
 *
 * 后端对应:apps/server/src/modules/analytics/{routes,validators,index}.ts
 *           apps/server/src/lib/analytics/{jwt,types,index}.ts
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { authClient } from "#/lib/auth-client"

/**
 * 当前暴露给前端的 Tinybird pipe 白名单。
 *
 * **必须** 和服务端 `apps/server/src/lib/analytics/types.ts` 的
 * `TenantPipeName` 保持同步 —— 那边是 single source of truth,
 * 白名单由 Zod enum 校验,前端传不在列表里的 pipe 会 400。
 */
export const TENANT_PIPES = [
  "tenant_request_overview",
  "tenant_event_counts",
  "tenant_trace",
  "tenant_event_names",
  "tenant_event_timeseries",
  "tenant_event_timeseries_fast",
  "tenant_event_funnel",
  "tenant_event_stream",
] as const

export type TenantPipeName = (typeof TENANT_PIPES)[number]

/** 后端 `/api/analytics/token` 的响应(envelope 已被 api-client 解包)。 */
export interface TinybirdTokenResponse {
  /** 短 TTL JWT,原样用作 URL 里的 `?token=...`。 */
  token: string
  /** ISO 字符串,token 过期时刻。 */
  expiresAt: string
  /** Tinybird pipes 基础 URL,末尾**不含**斜杠。完整 URL = `${baseUrl}/${pipe}.json`。 */
  baseUrl: string
  /** 本次签发 JWT 允许的 pipe 列表,方便调试。 */
  pipes: TenantPipeName[]
}

/** Tinybird 查询返回的标准 payload(pipes/<name>.json 的 shape)。 */
export interface TinybirdQueryResult<TRow = unknown> {
  data: TRow[]
  meta?: Array<{ name: string; type: string }>
  rows?: number
  /** Tinybird 自带的耗时 / 字节数统计。 */
  statistics?: {
    elapsed?: number
    rows_read?: number
    bytes_read?: number
  }
}

/** Tinybird CDN 返回 4xx/5xx 时抛出。 */
export class TinybirdQueryError extends Error {
  constructor(
    public status: number,
    public pipe: TenantPipeName,
    message: string,
  ) {
    super(message)
    this.name = "TinybirdQueryError"
  }
}

/** 把 pipes 数组规整成稳定的 cache key 片段(排序 + 去重)。 */
function normalizePipeKey(pipes: readonly TenantPipeName[]): string {
  return Array.from(new Set(pipes)).sort().join(",")
}

/**
 * 获取当前租户的 Tinybird JWT。
 *
 * - queryKey 里包含 `activeOrganizationId`,切换租户自动失效并重新签发。
 * - `staleTime` = 9min、`refetchInterval` = 9min,确保在 token 过期前(10min)
 *   就预刷新,客户端视角永远不会触发 403。
 * - 若后端未配置 Tinybird secrets,这里会直接 500;上层组件应该给出清晰的
 *   "Tinybird 未启用" 提示,而不是一直 retry。
 */
export function useTinybirdToken(pipes: readonly TenantPipeName[]) {
  const { data: activeOrg } = authClient.useActiveOrganization()
  const orgId = activeOrg?.id ?? null
  const pipeKey = normalizePipeKey(pipes)

  return useQuery<TinybirdTokenResponse>({
    queryKey: ["tinybird", "token", orgId, pipeKey],
    queryFn: () =>
      api.post<TinybirdTokenResponse>("/api/analytics/token", {
        pipes: Array.from(new Set(pipes)),
        ttlSeconds: 600,
      }),
    enabled: !!orgId && pipes.length > 0,
    staleTime: 9 * 60 * 1000, // 9min,略短于后端 600s TTL
    refetchInterval: 9 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // 避免 401/403 死循环;让上层看到错误决定是否重试
    retry: (failureCount, error) => {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status: unknown }).status
          : null
      if (status === 401 || status === 403 || status === 500) return false
      return failureCount < 2
    },
  })
}

/**
 * 从 Tinybird CDN 直接查询一条 pipe。
 *
 * **租户隔离保证**:URL 里任何 `org_id` 参数都会被 Tinybird 忽略,最终过滤
 * 用的是 JWT `fixed_params.org_id`(服务端签发时写入,不可篡改)。因此此
 * 处只需要传业务参数(时间范围、维度、过滤字段等)。
 *
 * 典型用法:
 * ```ts
 * const { data, isLoading } = useTinybirdQuery<{ day: string; count: number }>(
 *   "tenant_event_counts",
 *   { from: "2026-04-01", to: "2026-04-23", event: "task.completed" },
 * )
 * ```
 */
export function useTinybirdQuery<TRow = unknown>(
  pipe: TenantPipeName,
  params: Record<string, string | number | boolean | undefined | null> = {},
  options: Omit<
    UseQueryOptions<TinybirdQueryResult<TRow>, TinybirdQueryError>,
    "queryKey" | "queryFn"
  > = {},
) {
  const { data: activeOrg } = authClient.useActiveOrganization()
  const orgId = activeOrg?.id ?? null
  const tokenQuery = useTinybirdToken([pipe])

  // 把 params 序列化成稳定的字符串(按 key 排序),保证 queryKey 稳定
  const paramEntries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  const paramKey = paramEntries.map(([k, v]) => `${k}=${v}`).join("&")

  return useQuery<TinybirdQueryResult<TRow>, TinybirdQueryError>({
    queryKey: ["tinybird", "query", pipe, orgId, paramKey],
    queryFn: async () => {
      const token = tokenQuery.data
      if (!token) throw new TinybirdQueryError(0, pipe, "Token not ready")
      const qs = new URLSearchParams(paramEntries.map(([k, v]) => [k, v]))
      qs.set("token", token.token)
      const url = `${token.baseUrl}/${pipe}.json?${qs.toString()}`
      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        // Tinybird 403 通常是 token 过期 / fixed_params 不匹配;
        // 静默 refetch token 一次后让 React Query 自然 retry
        throw new TinybirdQueryError(
          res.status,
          pipe,
          text || `Tinybird returned ${res.status}`,
        )
      }
      return (await res.json()) as TinybirdQueryResult<TRow>
    },
    enabled:
      !!orgId &&
      !!tokenQuery.data &&
      !tokenQuery.isError &&
      (options.enabled ?? true),
    ...options,
  })
}

// ============================================================================
// Typed helper hooks — one per pipe. Keep these thin: just set the pipe name
// and row type, let `useTinybirdQuery` do everything else. When a new pipe
// ships, add a typed wrapper here so call sites don't stringly-reference pipe
// names all over the dashboard.
// ============================================================================

/** `tenant_request_overview` row — keep in sync with server/src/lib/tinybird.ts output schema. */
export interface TenantRequestOverviewRow {
  /** Bucket start timestamp (ISO / ClickHouse DateTime64). */
  bucket: string
  requests: number
  errors: number
  p95_ms: number
}

/**
 * Bucketed request / error / p95 for the current tenant.
 *
 * Typical usage: 30-day window at 1-day buckets for the dashboard trend chart,
 * or 1-hour window at 1-minute buckets for a realtime heartbeat.
 */
export function useTenantRequestOverview(args: {
  from: Date | string
  to: Date | string
  /** Bucket size in seconds. Default 1 day = 86400. Minute = 60, hour = 3600. */
  bucketSeconds?: number
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  return useTinybirdQuery<TenantRequestOverviewRow>(
    "tenant_request_overview",
    {
      date_from: toIso(args.from),
      date_to: toIso(args.to),
      bucket_seconds: args.bucketSeconds ?? 86_400,
    },
    { enabled: args.enabled },
  )
}

/** `tenant_event_counts` row shape. */
export interface TenantEventCountsRow {
  event: string
  c: number
  total_amount: number
}

/**
 * Event-type distribution within a time window. 可选 `event` 参数精确过滤到
 * 单个事件名。用于日志查询页的"事件分布"tab 和事件名 autocomplete。
 */
export function useTenantEventCounts(args: {
  from: Date | string
  to: Date | string
  /** Optional event name to filter to exactly one row. */
  event?: string
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  return useTinybirdQuery<TenantEventCountsRow>(
    "tenant_event_counts",
    {
      date_from: toIso(args.from),
      date_to: toIso(args.to),
      event: args.event ?? "",
    },
    { enabled: args.enabled },
  )
}

/** `tenant_trace` row shape — events that share one trace_id. */
export interface TenantTraceRow {
  timestamp: string
  event: string
  source: string
  outcome: string
  amount: number
  end_user_id: string
  event_data: string
}

/**
 * Full event stream for a single trace_id. Used by the log explorer's
 * "trace detail" drawer — click a trace in the table or paste a trace_id
 * in the search box to see the whole waterfall.
 *
 * Pass `enabled: false` until the user actually submits a trace_id; without
 * it, React Query will still send a request with empty trace_id and return
 * all rows for the org (which is expensive and misleading).
 */
export function useTenantTrace(args: {
  traceId: string
  enabled?: boolean
}) {
  return useTinybirdQuery<TenantTraceRow>(
    "tenant_trace",
    { trace_id: args.traceId },
    { enabled: args.enabled ?? !!args.traceId },
  )
}

// ============================================================================
// Phase 2 hooks — 自定义事件分析 / 漏斗 / 事件流浏览
// ============================================================================

/**
 * 单层 JSON key 校验。`event_data` 是 JSON 字符串列,我们只允许用户提取
 * **顶级** key — 多层嵌套留给后续物化列方案。这层正则在前端兜底:
 * - 阻止注入风险更小的 path(虽然 templating 会转义,但保留窄范围让查询语义清晰)
 * - 阻挡用户笔误(如 path 写成 "a.b" 期望嵌套但我们不支持)
 */
const JSON_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

export function isValidJsonKey(path: string): boolean {
  return JSON_KEY_RE.test(path)
}

/** `tenant_event_names` row — DISTINCT event + count over a window. */
export interface TenantEventNamesRow {
  event: string
  c: number
}

/**
 * 列出当前租户在时间范围内**实际上报过**的事件名(按计数倒序,LIMIT 500)。
 * 用作 explore / activity 页"事件名 combobox"的数据源 —— 比读 server 端
 * event-registry 更准确(后者只覆盖内部模块声明的事件,漏外部接入)。
 */
export function useTenantEventNames(args: {
  from: Date | string
  to: Date | string
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  return useTinybirdQuery<TenantEventNamesRow>(
    "tenant_event_names",
    {
      date_from: toIso(args.from),
      date_to: toIso(args.to),
    },
    { enabled: args.enabled },
  )
}

/** `tenant_event_timeseries` row shape. */
export interface TenantEventTimeseriesRow {
  bucket: string
  /** GroupBy 维度的值;`groupBy='none'` 时为空字符串。 */
  dim: string
  c: number
  total_amount: number
  uniq_users: number
}

/** Explore 页支持的 groupBy 维度白名单(对齐 pipe 模板的 if/elif 分支)。 */
export type EventTimeseriesGroupBy =
  | "none"
  | "source"
  | "outcome"
  | "event"
  | "end_user_id"
  | "json"

/**
 * 自定义事件分析(趋势 + groupBy 单 pipe)。
 *
 * 关键约束:
 * - `event` 必填,空字符串自动 `enabled=false`
 * - `groupBy='json'` 时 `jsonPathGroup` 必填且必须通过 `isValidJsonKey`
 * - `filters.jsonPath` 必须通过 `isValidJsonKey`
 * - JSON path/groupBy 启用时,前端层强制时间窗口 ≤ 30 天(超过 `enabled=false`)
 *
 * **Fast-path 路由**:当用户的查询全部"友好"(bucket ≥ 1h、groupBy ∈
 * 顶层 LowCardinality 列、无 end_user_id 过滤、无 JSON 路径)时,自动改打
 * `tenant_event_timeseries_fast` —— 它走 `events_hourly_agg` 物化视图,
 * 30 天 / 1h bucket 场景下扫描行数差 100×、延迟差 10-30×。
 *
 * 不友好的场景(分钟桶 / endUserId groupBy / JSON 任意字段)继续走 raw
 * `events` 表的 `tenant_event_timeseries`。这两条路径输出 row shape 完全
 * 一致,上层组件无感切换。
 */
export function useTenantEventTimeseries(args: {
  event: string
  from: Date | string
  to: Date | string
  bucketSeconds?: number
  groupBy?: EventTimeseriesGroupBy
  jsonPathGroup?: string
  filters?: {
    source?: string
    outcome?: string
    endUserId?: string
    jsonPath?: string
    jsonValue?: string
  }
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  const from = toIso(args.from)
  const to = toIso(args.to)
  const groupBy = args.groupBy ?? "none"
  const bucketSeconds = args.bucketSeconds ?? 3600

  const usesJson =
    groupBy === "json" ||
    (args.filters?.jsonPath != null && args.filters.jsonPath !== "")

  const jsonPathGroupOk =
    groupBy !== "json" ||
    (args.jsonPathGroup != null && isValidJsonKey(args.jsonPathGroup))

  const jsonFilterOk =
    args.filters?.jsonPath == null ||
    args.filters.jsonPath === "" ||
    isValidJsonKey(args.filters.jsonPath)

  // JSON 启用时强制 ≤ 30 天,避免全表 JSONExtract 扫描
  const within30d =
    !usesJson ||
    new Date(to).getTime() - new Date(from).getTime() <= 30 * 86_400 * 1000

  const enabled =
    !!args.event &&
    jsonPathGroupOk &&
    jsonFilterOk &&
    within30d &&
    (args.enabled ?? true)

  // Fast-path 资格判定 —— 任何一项不满足就走 raw events 慢路径
  const fastEligible =
    !usesJson &&
    bucketSeconds >= 3600 &&
    bucketSeconds % 3600 === 0 &&
    (groupBy === "none" ||
      groupBy === "source" ||
      groupBy === "outcome" ||
      groupBy === "event") &&
    !args.filters?.endUserId

  // 单次 hook 调用 —— 路径选择只影响 pipe 名 + 传哪些参数,React Rules of
  // Hooks 不允许 conditional return useXxx()。
  const pipe: TenantPipeName = fastEligible
    ? "tenant_event_timeseries_fast"
    : "tenant_event_timeseries"
  const params: Record<string, string | number> = fastEligible
    ? {
        date_from: from,
        date_to: to,
        event: args.event,
        bucket_seconds: bucketSeconds,
        group_by: groupBy === "none" ? "" : groupBy,
        source: args.filters?.source ?? "",
        outcome: args.filters?.outcome ?? "",
      }
    : {
        date_from: from,
        date_to: to,
        event: args.event,
        bucket_seconds: bucketSeconds,
        group_by: groupBy === "none" ? "" : groupBy,
        source: args.filters?.source ?? "",
        outcome: args.filters?.outcome ?? "",
        end_user_id: args.filters?.endUserId ?? "",
        json_path_group:
          groupBy === "json" ? (args.jsonPathGroup ?? "") : "",
        json_path_filter: args.filters?.jsonPath ?? "",
        json_value_filter: args.filters?.jsonValue ?? "",
      }

  return useTinybirdQuery<TenantEventTimeseriesRow>(pipe, params, { enabled })
}

/** `tenant_event_funnel` row shape. */
export interface TenantEventFunnelRow {
  step: number
  users: number
}

/**
 * windowFunnel 漏斗(2-5 步)。
 *
 * `steps` 第一项必填;后续步骤按位置传给 step2..step5,不传的步骤为空字符串。
 * `enabled` 默认 `false` —— 漏斗较重,前端用按钮触发 refetch,而不是输入即查。
 */
export function useTenantEventFunnel(args: {
  steps: string[]
  windowSeconds: number
  from: Date | string
  to: Date | string
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  const [step1 = "", step2 = "", step3 = "", step4 = "", step5 = ""] =
    args.steps
  return useTinybirdQuery<TenantEventFunnelRow>(
    "tenant_event_funnel",
    {
      date_from: toIso(args.from),
      date_to: toIso(args.to),
      window_seconds: args.windowSeconds,
      step1,
      step2,
      step3,
      step4,
      step5,
    },
    {
      enabled: !!step1 && (args.enabled ?? false),
    },
  )
}

/** `tenant_event_stream` row shape. */
export interface TenantEventStreamRow {
  timestamp: string
  event: string
  source: string
  outcome: string
  amount: number
  end_user_id: string
  trace_id: string
  event_data: string
}

/**
 * 原始事件流分页(timestamp DESC,游标分页)。
 * 上层把 `data.data[data.data.length-1].timestamp` 作为下一页 `beforeTs`。
 * Server pipe 内部 LIMIT 上限是 client 传值,这里夹一次防御性上限 500。
 */
export function useTenantEventStream(args: {
  from: Date | string
  to: Date | string
  filters?: {
    event?: string
    source?: string
    outcome?: string
    endUserId?: string
    jsonPath?: string
    jsonValue?: string
  }
  beforeTs?: string
  limit?: number
  enabled?: boolean
}) {
  const toIso = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString()
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
  const jsonFilterOk =
    args.filters?.jsonPath == null ||
    args.filters.jsonPath === "" ||
    isValidJsonKey(args.filters.jsonPath)

  return useTinybirdQuery<TenantEventStreamRow>(
    "tenant_event_stream",
    {
      date_from: toIso(args.from),
      date_to: toIso(args.to),
      event: args.filters?.event ?? "",
      source: args.filters?.source ?? "",
      outcome: args.filters?.outcome ?? "",
      end_user_id: args.filters?.endUserId ?? "",
      json_path_filter: args.filters?.jsonPath ?? "",
      json_value_filter: args.filters?.jsonValue ?? "",
      before_ts: args.beforeTs ?? "",
      limit,
    },
    { enabled: jsonFilterOk && (args.enabled ?? true) },
  )
}
