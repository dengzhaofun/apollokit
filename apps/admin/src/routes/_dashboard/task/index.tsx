import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { DefinitionTable } from "#/components/task/DefinitionTable"
import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { useTaskDefinitions, useTaskCategories } from "#/hooks/use-task"

export const Route = createFileRoute("/_dashboard/task/")({
  component: TaskListPage,
})

function TaskListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const {
    data: definitions,
    isPending,
    error,
  } = useTaskDefinitions(scopeToFilter(scope))
  const { data: categories } = useTaskCategories()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">Tasks</h1>
        <div className="ml-auto flex items-center gap-3">
          <ActivityScopeFilter value={scope} onChange={setScope} />
          <Button asChild size="sm" variant="outline">
            <Link to="/task/categories">Categories</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/task/create">
              <Plus className="size-4" />
              New Task
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Failed to load tasks: {error.message}
          </div>
        ) : categories && categories.length > 0 ? (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id}>
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all">
              <div className="rounded-xl border bg-card shadow-sm">
                <DefinitionTable data={definitions ?? []} />
              </div>
            </TabsContent>
            {categories.map((cat) => (
              <TabsContent key={cat.id} value={cat.id}>
                <div className="rounded-xl border bg-card shadow-sm">
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
          <div className="rounded-xl border bg-card shadow-sm">
            <DefinitionTable data={definitions ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
