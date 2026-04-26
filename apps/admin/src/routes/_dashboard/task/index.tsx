import { createFileRoute, Link } from "@tanstack/react-router"
import { ListTodoIcon, Plus, Tags } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { DefinitionTable } from "#/components/task/DefinitionTable"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useAllTaskCategories } from "#/hooks/use-task"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/task/")({
  component: TaskListPage,
})

function TaskListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const filter = scopeToFilter(scope)
  // Categories drive the tab strip; needs all categories at once.
  const { data: categories } = useAllTaskCategories()

  return (
    <PageShell>
      <PageHeader
        icon={<ListTodoIcon className="size-5" />}
        title={t("任务", "Tasks")}
        description={t(
          "任务列表分页 / 搜索均走服务端。",
          "Tasks are paginated and searched server-side.",
        )}
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Button asChild size="sm" variant="outline">
              <Link to="/task/categories">
                <Tags />
                {t("分类", "Categories")}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/task/create">
                <Plus />
                {t("新建任务", "New task")}
              </Link>
            </Button>
          </>
        }
      />

      <PageBody>
        {categories && categories.length > 0 ? (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">{t("全部", "All")}</TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id}>
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all">
              <DefinitionTable
                activityId={filter.activityId}
                includeActivity={filter.includeActivity}
              />
            </TabsContent>
            {categories.map((cat) => (
              <TabsContent key={cat.id} value={cat.id}>
                <DefinitionTable
                  categoryId={cat.id}
                  activityId={filter.activityId}
                  includeActivity={filter.includeActivity}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <DefinitionTable
            activityId={filter.activityId}
            includeActivity={filter.includeActivity}
          />
        )}
      </PageBody>
    </PageShell>
  )
}
