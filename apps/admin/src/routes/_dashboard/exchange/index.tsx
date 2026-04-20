import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { ExchangeConfigTable } from "#/components/exchange/ConfigTable"
import { useExchangeConfigs } from "#/hooks/use-exchange"

export const Route = createFileRoute("/_dashboard/exchange/")({
  component: ExchangeListPage,
})

function ExchangeListPage() {
  const { data: configs, isPending, error } = useExchangeConfigs()

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
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.exchange_failed_load_configs()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <ExchangeConfigTable data={configs ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
