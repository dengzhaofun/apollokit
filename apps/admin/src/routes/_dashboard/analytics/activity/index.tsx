import { createFileRoute } from "@tanstack/react-router"
import { Activity } from "lucide-react"

import {
  ComingSoon,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/analytics/activity/")({
  component: ActivityAnalyticsPage,
})

function ActivityAnalyticsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<Activity className="size-5" />}
        title={m.analytics_activity_title()}
      />
      <PageBody>
        <ComingSoon
          title={m.analytics_activity_title()}
          description={m.analytics_activity_coming_soon()}
        />
      </PageBody>
    </PageShell>
  )
}
