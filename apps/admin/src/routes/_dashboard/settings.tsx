import { Outlet, createFileRoute } from "@tanstack/react-router"

import { SettingsNav } from "#/components/SettingsNav"
import { seo } from "#/lib/seo"

export const Route = createFileRoute("/_dashboard/settings")({
  head: () => seo({ title: "Settings", noindex: true }),
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <div className="flex flex-1 gap-6 p-6">
      <SettingsNav />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
