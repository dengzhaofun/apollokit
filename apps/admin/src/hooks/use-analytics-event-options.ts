/**
 * 数据分析三页面（Explore / Funnel / Activity）共用的事件名候选 hook。
 *
 * 合并两路数据源：
 *   1. Tinybird `tenant_event_names` —— 当前租户在时间窗内**实际上报过**的
 *      event_name + 计数。新租户/empty state 时为空。
 *   2. `GET /api/v1/event-catalog?capability=analytics` —— **平台目录**里
 *      声明的 internal-event + platform-event。即使没数据也能列出。
 *
 * 输出按"是否在目录"+"是否有数据"分桶排序，让用户在没数据时也能看到
 * 平台支持哪些事件。
 */

import { useMemo } from "react"

import { useEventCatalog } from "#/hooks/use-event-catalog"
import {
  useTenantEventNames,
  type TenantEventNamesRow,
} from "#/lib/tinybird"
import type { CatalogEventView, EventKind } from "#/lib/types/event-catalog"

export interface AnalyticsEventOption {
  event: string
  /** 实际上报次数；null = 在目录但当前窗口无数据 */
  c: number | null
  /** 是否在 event-catalog (analytics capability) 中声明 */
  inCatalog: boolean
  /** internal-event / platform-event / http-request；null = 已上报但未注册 */
  kind: EventKind | null
  description: string | null
  owner: string | null
}

export interface UseAnalyticsEventOptionsResult {
  options: AnalyticsEventOption[]
  /** 两路任意一路 loading */
  isLoading: boolean
  /** 两路都失败时为 true；任一路成功就视作可用 */
  isError: boolean
}

export function useAnalyticsEventOptions(args: {
  from: Date | string
  to: Date | string
  enabled?: boolean
}): UseAnalyticsEventOptionsResult {
  const namesQuery = useTenantEventNames({
    from: args.from,
    to: args.to,
    enabled: args.enabled,
  })
  const catalogQuery = useEventCatalog({ capability: "analytics" })

  const options = useMemo(() => {
    const namesRows: TenantEventNamesRow[] = namesQuery.data?.data ?? []
    const catalogRows: CatalogEventView[] = catalogQuery.data ?? []

    const byName = new Map<string, AnalyticsEventOption>()

    for (const row of catalogRows) {
      byName.set(row.name, {
        event: row.name,
        c: null,
        inCatalog: true,
        kind: row.kind,
        description: row.description,
        owner: row.owner,
      })
    }

    for (const row of namesRows) {
      const existing = byName.get(row.event)
      if (existing) {
        existing.c = Number(row.c)
      } else {
        byName.set(row.event, {
          event: row.event,
          c: Number(row.c),
          inCatalog: false,
          kind: null,
          description: null,
          owner: null,
        })
      }
    }

    const list = Array.from(byName.values())
    list.sort((a, b) => {
      const bucketA = bucketOf(a)
      const bucketB = bucketOf(b)
      if (bucketA !== bucketB) return bucketA - bucketB
      // 同桶按 c 倒序，无 c 时按字典序
      const ca = a.c ?? -1
      const cb = b.c ?? -1
      if (ca !== cb) return cb - ca
      return a.event.localeCompare(b.event)
    })
    return list
  }, [namesQuery.data, catalogQuery.data])

  return {
    options,
    isLoading: namesQuery.isLoading || catalogQuery.isLoading,
    isError: namesQuery.isError && catalogQuery.isError,
  }
}

// 排序桶：越小越靠前
function bucketOf(o: AnalyticsEventOption): number {
  if (o.inCatalog && o.c !== null && o.c > 0) return 0 // 已注册且活跃
  if (!o.inCatalog && o.c !== null && o.c > 0) return 1 // 未注册但有数据
  return 2 // 在目录但无数据
}
