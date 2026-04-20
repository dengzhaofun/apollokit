import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
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
