import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { SchemaTable } from "#/components/entity/SchemaTable"
import { listSearchSchema } from "#/lib/list-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/entity/schemas/")({
  component: EntitySchemasPage,
  validateSearch: listSearchSchema.passthrough(),
})

function EntitySchemasPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/entity/schemas/create" params={{ orgSlug, projectSlug }}>
                <Plus className="size-4" />
                {m.entity_new_schema()}
              </Link>
            }
            size="sm"
          />
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <SchemaTable route={Route} />
      </main>
    </>
  )
}
