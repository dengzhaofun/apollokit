/**
 * 子系统模块概览 —— v1 落地（替换之前的 ComingSoon 占位）。
 *
 * 横向看项目下所有子系统模块的运营快照，每个模块一张卡片：
 *   - totalCount：该模块在 PG 主表的当前总量
 *   - recent24hActivity：最近 24h 创建的数量
 *
 * 数据源: useAnalyticsModulesOverview (server: 后端 fan-out 各 module 的 PG count)
 *
 * 卡片本身不带链接 —— 进具体模块走左侧 sidebar，避免 TanStack typed-route
 * 断言污染。
 */

import { createFileRoute } from "@tanstack/react-router"
import {
  Activity,
  Bell,
  CalendarCheck,
  Dices,
  ListChecks,
  ListTodo,
  Mail,
  Medal,
  Package,
  PartyPopper,
  ShoppingCart,
  Ticket,
  type LucideIcon,
} from "lucide-react"

import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
import { useAnalyticsModulesOverview } from "#/hooks/use-project-analytics"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/analytics/modules/",
)({
  component: ModuleAnalyticsPage,
})

const MODULE_ICONS: Record<string, LucideIcon> = {
  activity: PartyPopper,
  task: ListTodo,
  leaderboard: Medal,
  check_in: CalendarCheck,
  lottery: Dices,
  shop: ShoppingCart,
  cdkey: Ticket,
  banner: Bell,
  item: Package,
  mail: Mail,
}

function moduleDisplayName(key: string): string {
  switch (key) {
    case "activity":
      return m.analytics_module_name_activity()
    case "task":
      return m.analytics_module_name_task()
    case "leaderboard":
      return m.analytics_module_name_leaderboard()
    case "check_in":
      return m.analytics_module_name_check_in()
    case "lottery":
      return m.analytics_module_name_lottery()
    case "shop":
      return m.analytics_module_name_shop()
    case "cdkey":
      return m.analytics_module_name_cdkey()
    case "banner":
      return m.analytics_module_name_banner()
    case "item":
      return m.analytics_module_name_item()
    case "mail":
      return m.analytics_module_name_mail()
    default:
      return key
  }
}

function ModuleAnalyticsPage() {
  const query = useAnalyticsModulesOverview()

  return (
    <PageShell>
      <PageHeader
        icon={<ListChecks className="size-5" />}
        title={m.analytics_modules_title()}
        description={m.analytics_modules_subtitle()}
      />
      <PageBody>
        <PageSection>
          {query.isPending ? (
            <div className="text-muted-foreground">{m.common_loading()}</div>
          ) : query.error ? (
            <div className="text-destructive">
              {m.common_failed_to_load({
                resource: m.analytics_modules_title(),
                error: query.error.message,
              })}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {query.data?.items.map((item) => {
                const Icon = MODULE_ICONS[item.module] ?? Activity
                return (
                  <div
                    key={item.module}
                    className="rounded-xl border bg-card p-5 shadow-sm"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="size-4" />
                      <span className="text-xs font-medium uppercase tracking-wide">
                        {moduleDisplayName(item.module)}
                      </span>
                    </div>
                    <div className="mt-3 text-3xl font-semibold">
                      {item.totalCount.toLocaleString()}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {m.analytics_modules_card_recent({
                        count: item.recent24hActivity,
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </PageSection>
      </PageBody>
    </PageShell>
  )
}
