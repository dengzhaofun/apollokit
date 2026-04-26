import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarRangeIcon, FileStack, Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { ActivityTable } from "#/components/activity/ActivityTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { useActivityTickRun } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/activity/")({
  component: ActivityListPage,
})

function ActivityListPage() {
  const tickMutation = useActivityTickRun()

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarRangeIcon className="size-5" />}
        title={m.activity_page_title()}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/activity/templates">
                <FileStack />
                {m.activity_action_templates()}
              </Link>
            </Button>
            <WriteGate>
              <Button
                variant="outline"
                size="sm"
                disabled={tickMutation.isPending}
                onClick={async () => {
                  try {
                    const r = await tickMutation.mutateAsync()
                    toast.success(
                      m.activity_tick_success({
                        advanced: r.advanced,
                        scheduleFired: r.scheduleFired,
                        errors: r.errors,
                      }),
                    )
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.activity_tick_failed())
                  }
                }}
              >
                <RotateCw />
                {m.activity_action_tick()}
              </Button>
            </WriteGate>
            <WriteGate>
              <Button asChild size="sm">
                <Link to="/activity/create">
                  <Plus />
                  {m.activity_action_create()}
                </Link>
              </Button>
            </WriteGate>
          </>
        }
      />

      <PageBody>
        <ActivityTable />
      </PageBody>
    </PageShell>
  )
}
