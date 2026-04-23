import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { EventTable } from "#/components/event-catalog/EventTable"
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useEventCatalog } from "#/hooks/use-event-catalog"
import type { EventCapability } from "#/lib/types/event-catalog"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/event-catalog/")({
  component: EventCatalogListPage,
})

/** 'all' 代表不过滤,其他值直接映射到后端的 `?capability=` 参数。 */
type CapabilityTab = "all" | EventCapability

function EventCatalogListPage() {
  const [tab, setTab] = useState<CapabilityTab>("all")

  const { data: items, isPending, error } = useEventCatalog({
    capability: tab === "all" ? undefined : tab,
  })

  return (
    <main className="flex-1 space-y-4 p-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {m.event_catalog_description()}
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CapabilityTab)}>
        <TabsList>
          <TabsTrigger value="all">{m.event_catalog_tab_all()}</TabsTrigger>
          <TabsTrigger value="task-trigger">
            {m.event_catalog_tab_task_trigger()}
          </TabsTrigger>
          <TabsTrigger value="analytics">
            {m.event_catalog_tab_analytics()}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          {m.event_catalog_failed_load()} {error.message}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <EventTable data={items ?? []} />
        </div>
      )}
    </main>
  )
}
