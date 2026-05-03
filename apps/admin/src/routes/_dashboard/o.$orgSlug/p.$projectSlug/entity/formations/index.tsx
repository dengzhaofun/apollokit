import { createFileRoute } from "@tanstack/react-router"
import { Link } from "#/components/router-helpers"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { FormationConfigTable } from "#/components/entity/FormationConfigTable"
import { listSearchSchema } from "#/lib/list-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/entity/formations/")({
  component: EntityFormationsPage,
  validateSearch: listSearchSchema.passthrough(),
})

function EntityFormationsPage() {
  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button
            render={
              <Link to="/entity/formations/create">
                <Plus className="size-4" />
                {m.entity_new_formation()}
              </Link>
            }
            size="sm"
          />
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <FormationConfigTable route={Route} />
      </main>
    </>
  )
}
