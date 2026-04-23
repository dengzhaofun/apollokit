import { createFileRoute, Link } from "@tanstack/react-router"
import { FlaskConical, Plus } from "lucide-react"

import { BadgeNodeTable } from "#/components/badge/BadgeNodeTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { useBadgeNodes } from "#/hooks/use-badge"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/badge/")({
  component: BadgeListPage,
})

function BadgeListPage() {
  const { data: items, isPending, error } = useBadgeNodes()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/badge/inspector">
              <FlaskConical className="size-4" />
              {m.badge_inspector_title()}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/badge/create">
              <Plus className="size-4" />
              {m.badge_new()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.badge_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <BadgeNodeTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
