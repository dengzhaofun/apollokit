import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { DefinitionForm } from "#/components/task/DefinitionForm"
import { useCreateTaskDefinition, useAllTaskCategories } from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/task/create")({
  component: TaskCreatePage,
})

function TaskCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateTaskDefinition()
  const { data: categories } = useAllTaskCategories()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <DefinitionForm
            categories={categories ?? []}
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                const row = await createMutation.mutateAsync(values)
                toast.success("Task created")
                navigate({ to: "/task/$taskId", params: { taskId: row.id } })
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
