import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CatalogEventView,
  CatalogListResponse,
  EventCapability,
  UpdateEventCatalogInput,
} from "#/lib/types/event-catalog"

const CATALOG_KEY = ["event-catalog"] as const
const entryKey = (name: string) => ["event-catalog", name] as const

/**
 * 列出事件目录,可选按 capability 过滤。
 *
 * 后端路由:`GET /api/event-catalog?capability=<cap>`。
 *   - 不传 capability:返回 4 种来源的全量合并视图
 *   - `task-trigger`:仅返回能绑到 task.processEvent 的事件(task 选择器用)
 *   - `analytics`:仅返回进了 Tinybird 的事件(数据分析选择器用)
 *
 * queryKey 显式包含 capability,租户 + filter 任一变化都会自动重新请求。
 */
export function useEventCatalog(opts: { capability?: EventCapability } = {}) {
  const { capability } = opts
  return useQuery({
    queryKey: [...CATALOG_KEY, capability ?? null],
    queryFn: () => {
      const qs = capability
        ? `?capability=${encodeURIComponent(capability)}`
        : ""
      return api.get<CatalogListResponse>(`/api/event-catalog${qs}`)
    },
    select: (data) => data.items,
  })
}

export function useEventCatalogEntry(name: string) {
  return useQuery({
    queryKey: entryKey(name),
    queryFn: () =>
      api.get<CatalogEventView>(
        `/api/event-catalog/${encodeURIComponent(name)}`,
      ),
    enabled: !!name,
  })
}

export function useUpdateEventCatalogEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      input,
    }: {
      name: string
      input: UpdateEventCatalogInput
    }) =>
      api.patch<CatalogEventView>(
        `/api/event-catalog/${encodeURIComponent(name)}`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CATALOG_KEY })
      qc.invalidateQueries({ queryKey: entryKey(vars.name) })
    },
  })
}
