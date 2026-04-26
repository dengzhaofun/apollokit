import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { FormationConfigTable } from "#/components/entity/FormationConfigTable"

export const Route = createFileRoute("/_dashboard/entity/formations/")({
  component: EntityFormationsPage,
})

function EntityFormationsPage() {
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
        <FormationConfigTable />
      </main>
    </>
  )
}
