import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { DefinitionForm } from "#/components/task/DefinitionForm"
import {
  useTaskDefinition,
  useUpdateTaskDefinition,
  useDeleteTaskDefinition,
  useTaskCategories,
} from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/task/$taskId/")({
  component: TaskDetailPage,
})

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()
  const { data: definition, isPending, error } = useTaskDefinition(taskId)
  const { data: categories } = useTaskCategories()
  const updateMutation = useUpdateTaskDefinition()
  const deleteMutation = useDeleteTaskDefinition()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }

  if (error || !definition) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        Task not found
      </div>
    )
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{definition.name}</h1>
        <div className="ml-auto">
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (!confirm("Delete this task definition?")) return
              try {
                await deleteMutation.mutateAsync(taskId)
                toast.success("Task deleted")
                navigate({ to: "/task" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error("Failed to delete task")
                }
              }
            }}
          >
            {m.common_delete()}
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <DefinitionForm
            defaultValues={definition}
            categories={categories ?? []}
            submitLabel={m.common_save()}
            isPending={updateMutation.isPending}
            onSubmit={async (values) => {
              try {
                await updateMutation.mutateAsync({
                  key: taskId,
                  input: values,
                })
                toast.success("Task updated")
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error("Failed to update task")
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
