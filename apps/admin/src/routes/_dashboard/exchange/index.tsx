import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { ExchangeConfigTable } from "#/components/exchange/ConfigTable"
import { listSearchSchema } from "#/lib/list-search"

export const Route = createFileRoute("/_dashboard/exchange/")({
  component: ExchangeListPage,
  validateSearch: listSearchSchema.passthrough(),
})

function ExchangeListPage() {
  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/exchange/create">
              <Plus className="size-4" />
              {m.exchange_new_config()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <ExchangeConfigTable route={Route} />
      </main>
    </>
  )
}
