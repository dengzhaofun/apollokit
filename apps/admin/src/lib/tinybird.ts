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
