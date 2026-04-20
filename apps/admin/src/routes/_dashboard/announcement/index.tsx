import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { AnnouncementTable } from "#/components/announcement/AnnouncementTable"
import { Button } from "#/components/ui/button"
import { useAnnouncements } from "#/hooks/use-announcement"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/announcement/")({
  component: AnnouncementListPage,
})

function AnnouncementListPage() {
  const { data: items, isPending, error } = useAnnouncements()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/announcement/create">
              <Plus className="size-4" />
              {m.announcement_new()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.announcement_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.announcement_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <AnnouncementTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
