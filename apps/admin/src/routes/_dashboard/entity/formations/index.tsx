import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { FormationConfigTable } from "#/components/entity/FormationConfigTable"
import { useEntityFormationConfigs } from "#/hooks/use-entity"

export const Route = createFileRoute("/_dashboard/entity/formations/")({
  component: EntityFormationsPage,
})

function EntityFormationsPage() {
  const { data: formations, isPending, error } = useEntityFormationConfigs()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/entity/formations/create">
              <Plus className="size-4" />
              {m.entity_new_formation()}
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
            {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <FormationConfigTable data={formations ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
