import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
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
    <PageShell>
      <PageHeader
        title={m.entity_formations()}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/entity/formations/create" params={{ orgSlug, projectSlug }}>
                <Plus className="size-4" />
                {m.entity_new_formation()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <PageBody>
        <FormationConfigTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
