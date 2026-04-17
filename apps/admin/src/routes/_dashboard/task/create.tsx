import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { DefinitionForm } from "#/components/task/DefinitionForm"
import { useCreateTaskDefinition, useTaskCategories } from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"

type TaskCreateSearch = {
  activityId?: string
  returnTo?: string
}

export const Route = createFileRoute("/_dashboard/task/create")({
  component: TaskCreatePage,
  validateSearch: (raw: Record<string, unknown>): TaskCreateSearch => ({
    activityId:
      typeof raw.activityId === "string" ? raw.activityId : undefined,
    returnTo: typeof raw.returnTo === "string" ? raw.returnTo : undefined,
  }),
})

function TaskCreatePage() {
  const navigate = useNavigate()
  const { activityId, returnTo } = Route.useSearch()
  const createMutation = useCreateTaskDefinition()
  const { data: categories } = useTaskCategories()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">
          New Task Definition
          {activityId ? (
            <span className="ml-2 text-xs text-muted-foreground">
              (将关联到活动)
            </span>
          ) : null}
        </h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <DefinitionForm
            categories={categories ?? []}
            defaultValues={activityId ? { activityId } : undefined}
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                const row = await createMutation.mutateAsync({
                  ...values,
                  activityId: activityId ?? values.activityId ?? null,
                })
                toast.success("Task created")
                if (returnTo) {
                  window.location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}createdRefId=${row.id}`
                } else {
                  navigate({ to: "/task/$taskId", params: { taskId: row.id } })
                }
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error("Failed to create task")
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
