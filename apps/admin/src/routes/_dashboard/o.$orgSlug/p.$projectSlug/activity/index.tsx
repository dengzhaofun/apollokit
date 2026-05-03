import { createFileRoute } from "@tanstack/react-router"
import { Link } from "#/components/router-helpers"
import { CalendarRangeIcon, FileStack, Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { ActivityTable } from "#/components/activity/ActivityTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { Can } from "#/components/auth/Can"
import { useActivityTickRun } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/activity/")({
  component: ActivityListPage,
  validateSearch: listSearchSchema.passthrough(),
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
            <Button
              render={
                <Link to="/activity/templates">
                  <FileStack />
                  {m.activity_action_templates()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <Can resource="activity" action="write" mode="disable">
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
            </Can>
            <Can resource="activity" action="write" mode="disable">
              <Button
                render={
                  <Link to="/activity/create">
                    <Plus />
                    {m.activity_action_create()}
                  </Link>
                }
                size="sm"
              />
            </Can>
          </>
        }
      />

      <PageBody>
        <ActivityTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
