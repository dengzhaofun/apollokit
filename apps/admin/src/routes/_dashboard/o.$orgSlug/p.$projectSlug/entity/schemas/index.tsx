import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
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
    <PageShell>
      <PageHeader
        title={m.entity_schemas()}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/entity/schemas/create" params={{ orgSlug, projectSlug }}>
                <Plus className="size-4" />
                {m.entity_new_schema()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <PageBody>
        <SchemaTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
