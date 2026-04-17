import { createFileRoute, Link } from "@tanstack/react-router"
import { FileStack, Plus, RotateCw, Webhook } from "lucide-react"
import { toast } from "sonner"

import { ActivityTable } from "#/components/activity/ActivityTable"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useActivities,
  useActivityTickRun,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/activity/")({
  component: ActivityListPage,
})

function ActivityListPage() {
  const { data: activities, isPending, error } = useActivities()
  const tickMutation = useActivityTickRun()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">活动</h1>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/activity/templates">
              <FileStack className="size-4" />
              周期模板
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/activity/webhooks">
              <Webhook className="size-4" />
              Webhook endpoints
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={tickMutation.isPending}
            onClick={async () => {
              try {
                const r = await tickMutation.mutateAsync()
                toast.success(
                  `tick 完成：状态推进 ${r.advanced}，schedule ${r.scheduleFired}，webhook ${r.webhooksDelivered}，errors ${r.errors}`,
                )
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("tick 失败")
              }
            }}
          >
            <RotateCw className="size-4" />
            手动 tick
          </Button>
          <Button asChild size="sm">
            <Link to="/activity/create">
              <Plus className="size-4" />
              新建活动
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            加载中…
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            加载失败：{error.message}
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
