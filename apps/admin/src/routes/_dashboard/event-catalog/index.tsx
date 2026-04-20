import { createFileRoute } from "@tanstack/react-router"

import { EventTable } from "#/components/event-catalog/EventTable"
import { useEventCatalog } from "#/hooks/use-event-catalog"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/event-catalog/")({
  component: EventCatalogListPage,
})

function EventCatalogListPage() {
  const { data: items, isPending, error } = useEventCatalog()

  return (
    <>
      <main className="flex-1 p-6">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          {m.event_catalog_description()}
        </p>

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
    </>
  )
}
