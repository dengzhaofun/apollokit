import { createFileRoute, Link } from "@tanstack/react-router"
import { FileStack, Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { ActivityTable } from "#/components/activity/ActivityTable"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import {
  useActivities,
  useActivityTickRun,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/activity/")({
  component: ActivityListPage,
})

function ActivityListPage() {
  const { data: activities, isPending, error } = useActivities()
  const tickMutation = useActivityTickRun()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/activity/templates">
              <FileStack className="size-4" />
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
              <RotateCw className="size-4" />
              {m.activity_action_tick()}
            </Button>
          </WriteGate>
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/activity/create">
                <Plus className="size-4" />
                {m.activity_action_create()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.common_failed_to_load({ resource: m.activity_page_title(), error: error.message })}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <ActivityTable data={activities ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
