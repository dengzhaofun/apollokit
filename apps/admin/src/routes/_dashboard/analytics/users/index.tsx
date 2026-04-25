import { createFileRoute } from "@tanstack/react-router"
import { PieChart } from "lucide-react"

import {
  ComingSoon,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/analytics/users/")({
  component: UserAnalyticsPage,
})

function UserAnalyticsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<PieChart className="size-5" />}
        title={m.analytics_users_title()}
      />
      <PageBody>
        <ComingSoon
          title={m.analytics_users_title()}
          description={m.analytics_users_coming_soon()}
        />
      </PageBody>
    </PageShell>
  )
}
