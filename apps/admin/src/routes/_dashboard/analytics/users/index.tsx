import { createFileRoute } from "@tanstack/react-router"
import { PieChart } from "lucide-react"

import { PageHeaderActions } from "#/components/PageHeader"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/analytics/users/")({
  component: UserAnalyticsPage,
})

function UserAnalyticsPage() {
  return (
    <>
      <PageHeaderActions>
        <PieChart className="size-4" />
      </PageHeaderActions>
      <main className="flex-1 p-6">
        <ComingSoonCard
          title={m.analytics_users_title()}
          description={m.analytics_users_coming_soon()}
        />
      </main>
    </>
  )
}

function ComingSoonCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-card-foreground shadow-sm">
      <h2 className="mb-2 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
