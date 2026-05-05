/**
 * 项目级数据分析 hooks —— `/analytics/{users,modules,overview}` 页面后端。
 *
 * 这里只封装"server 聚合"那一层；DAU 时序、用户活跃天数、Top 事件
 * 这些直接走 Tinybird typed hooks（在 `lib/tinybird.ts`），避免双重往返。
 */

import { useQuery } from "@tanstack/react-query"

import { api } from "#/lib/api-client"

export interface CurrentMauUsage {
  yearMonth: string
  mau: number
  quota: number | null
  overage: number
  overageUnitsPer1k: number
  projectedOverageCents: number
  plan: { id: string; name: string; slug: string } | null
  subscriptionStatus: "active" | "past_due" | "canceled" | null
}

export interface AnalyticsUsersOverview {
  current: CurrentMauUsage
  history: Array<{ yearMonth: string; mau: number }>
}

export function useAnalyticsUsersOverview(args: { months?: number } = {}) {
  const months = args.months ?? 12
  return useQuery({
    queryKey: ["analytics-users-overview", months],
    queryFn: () =>
      api.get<AnalyticsUsersOverview>(
        `/api/v1/analytics/users/overview?months=${months}`,
      ),
  })
}

export interface AnalyticsModulesOverview {
  items: Array<{
    module: string
    totalCount: number
    recent24hActivity: number
  }>
}

export function useAnalyticsModulesOverview() {
  return useQuery({
    queryKey: ["analytics-modules-overview"],
    queryFn: () =>
      api.get<AnalyticsModulesOverview>("/api/v1/analytics/modules/overview"),
  })
}

export interface AnalyticsProjectOverview {
  activeActivities: number
  topActivities: Array<{ alias: string; name: string; participants: number }>
  membershipFunnel: {
    joined: number
    completed: number
    dropped: number
  }
  currentMau: {
    yearMonth: string
    mau: number
    quota: number | null
  }
}

export function useAnalyticsProjectOverview() {
  return useQuery({
    queryKey: ["analytics-project-overview"],
    queryFn: () =>
      api.get<AnalyticsProjectOverview>("/api/v1/analytics/project/overview"),
  })
}
