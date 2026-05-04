import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeader } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { ExchangeConfigTable } from "#/components/exchange/ConfigTable"
import { listSearchSchema } from "#/lib/list-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/exchange/")({
  component: ExchangeListPage,
  validateSearch: listSearchSchema.passthrough(),
})

function ExchangeListPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <>
      <PageHeader
        title="兑换"
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/exchange/create" params={{ orgSlug, projectSlug }}>
                <Plus className="size-4" />
                {m.exchange_new_config()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <main className="flex-1 p-6">
        <ExchangeConfigTable route={Route} />
      </main>
    </>
  )
}
