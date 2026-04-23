import { createFileRoute } from "@tanstack/react-router"
import { Activity } from "lucide-react"

import { PageHeaderActions } from "#/components/PageHeader"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/analytics/activity/")({
  component: ActivityAnalyticsPage,
})

function ActivityAnalyticsPage() {
  return (
    <>
      <PageHeaderActions>
        <Activity className="size-4" />
      </PageHeaderActions>
      <main className="flex-1 p-6">
        <div className="rounded-xl border border-dashed bg-card p-8 text-card-foreground shadow-sm">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">
            {m.analytics_activity_title()}
          </h2>
          <p className="text-muted-foreground">
            {m.analytics_activity_coming_soon()}
          </p>
        </div>
      </main>
    </>
  )
}
