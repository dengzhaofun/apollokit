import { Outlet, createFileRoute } from "@tanstack/react-router"

import { SettingsNav } from "#/components/SettingsNav"
import { seo } from "#/lib/seo"

export const Route = createFileRoute("/_dashboard/settings")({
  head: () => seo({ title: "Settings", noindex: true }),
  component: SettingsLayout,
})

/*
 * Settings 布局:
 *   - >=md 桌面:左 sidebar nav + 右 outlet 两栏
 *   - <md 移动:nav 横向 scroll 排顶部,outlet 全宽下方
 *     (SettingsNav 内部根据 viewport 切换 vertical / horizontal 形态)
 */
function SettingsLayout() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
      <SettingsNav />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
