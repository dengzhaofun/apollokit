import { createFileRoute } from "@tanstack/react-router"
import { LineChart } from "lucide-react"

import {
  ComingSoon,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/analytics/modules/")({
  component: ModuleAnalyticsPage,
})

function ModuleAnalyticsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<LineChart className="size-5" />}
        title={m.analytics_modules_title()}
      />
      <PageBody>
        <ComingSoon
          title={m.analytics_modules_title()}
          description={m.analytics_modules_coming_soon()}
        />
      </PageBody>
    </PageShell>
  )
}
