import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { SchemaTable } from "#/components/entity/SchemaTable"
import { useEntitySchemas } from "#/hooks/use-entity"

export const Route = createFileRoute("/_dashboard/entity/schemas/")({
  component: EntitySchemasPage,
})

function EntitySchemasPage() {
  const { data: schemas, isPending, error } = useEntitySchemas()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/entity/schemas/create">
              <Plus className="size-4" />
              {m.entity_new_schema()}
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
            <SchemaTable data={schemas ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
