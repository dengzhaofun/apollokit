import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { confirm } from "#/components/patterns"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { DefinitionForm } from "#/components/task/DefinitionForm"
import { AssignmentPanel } from "#/components/task/AssignmentPanel"
import {
  useTaskDefinition,
  useUpdateTaskDefinition,
  useDeleteTaskDefinition,
  useAllTaskCategories,
} from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"
import type { CreateDefinitionInput } from "#/lib/types/task"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/task/$taskId/")({
  component: TaskDetailPage,
})

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()
  const { data: definition, isPending, error } = useTaskDefinition(taskId)
  const { data: categories } = useAllTaskCategories()
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
      <PageHeaderActions>
        {definition.visibility === "assigned" && (
          <Badge variant="outline" className="ml-2">
            {m.task_visibility_assigned_badge()}
          </Badge>
        )}
        <div className="ml-auto">
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "删除任务定义?",
                description: `定义 "${definition.name}" 删除后不可恢复,且会同时清除所有关联 assignment。`,
                confirmLabel: "删除",
                danger: true,
              })
              if (!ok) return
              try {
                await deleteMutation.mutateAsync(taskId)
                toast.success("Task deleted")
                navigate({ to: "/o/$orgSlug/p/$projectSlug/task" })
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
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs defaultValue="config">
            <TabsList>
              <TabsTrigger value="config">{m.task_tab_config()}</TabsTrigger>
              <TabsTrigger value="assignments">
                {m.task_tab_assignments()}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="config">
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <DefinitionForm
                  // TaskDefinition 从 SDK 过来的 period/countingMethod/visibility
                  // 都是 string,而 CreateDefinitionInput 里是 TaskPeriod/
                  // CountingMethod/TaskVisibility 联合类型。运行时这些字段
                  // 永远在联合内,直接转窄类型给 form 用即可。
                  defaultValues={definition as Partial<CreateDefinitionInput>}
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
            </TabsContent>
            <TabsContent value="assignments">
              <AssignmentPanel definition={definition} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  )
}
