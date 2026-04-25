import { createFileRoute, Link } from "@tanstack/react-router"
import { ListTodoIcon, Plus, Tags } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { DefinitionTable } from "#/components/task/DefinitionTable"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useTaskCategories, useTaskDefinitions } from "#/hooks/use-task"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/task/")({
  component: TaskListPage,
})

function TaskListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const {
    data: definitions,
    isPending,
    error,
    refetch,
  } = useTaskDefinitions(scopeToFilter(scope))
  const { data: categories } = useTaskCategories()
  const total = definitions?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<ListTodoIcon className="size-5" />}
        title={t("任务", "Tasks")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个任务定义`, `${total} task definitions`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("任务加载失败", "Failed to load tasks")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有任务", "No tasks yet")}
            description={t(
              "创建第一个任务定义,通过完成奖励驱动玩家行为。",
              "Create your first task definition to drive player behavior with rewards.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/task/create">
                  <Plus />
                  {t("新建任务", "New task")}
                </Link>
              </Button>
            }
          />
        ) : categories && categories.length > 0 ? (
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
              <div className="rounded-lg border bg-card overflow-hidden">
                <DefinitionTable data={definitions ?? []} />
              </div>
            </TabsContent>
            {categories.map((cat) => (
              <TabsContent key={cat.id} value={cat.id}>
                <div className="rounded-lg border bg-card overflow-hidden">
                  <DefinitionTable
                    data={(definitions ?? []).filter(
                      (d) => d.categoryId === cat.id,
                    )}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <DefinitionTable data={definitions ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
