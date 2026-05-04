import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
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
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/entity/formations/create" params={{ orgSlug, projectSlug }}>
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
