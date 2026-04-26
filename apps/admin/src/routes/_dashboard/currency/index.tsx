import { useMemo, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { DefinitionTable } from "#/components/currency/DefinitionTable"
import { LedgerTable } from "#/components/currency/LedgerTable"
import { useAllCurrencies, useCurrencyLedger } from "#/hooks/use-currency"

export const Route = createFileRoute("/_dashboard/currency/")({
  component: CurrencyListPage,
})

function CurrencyListPage() {
  // Selector dropdown for the ledger filter — needs all currencies at once.
  const { data: allCurrencies } = useAllCurrencies()

  const [ledgerUser, setLedgerUser] = useState("")
  const [ledgerCurrency, setLedgerCurrency] = useState("")
  const {
    data: ledger,
    isPending: ledgerPending,
    error: ledgerError,
  } = useCurrencyLedger({
    endUserId: ledgerUser || undefined,
    currencyId: ledgerCurrency || undefined,
    limit: 100,
  })

  const currencyNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of allCurrencies ?? []) map.set(c.id, c.name)
    return map
  }, [allCurrencies])

  return (
    <>
      <main className="flex-1 p-6">
        <Tabs defaultValue="definitions">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="definitions">
                {m.currency_definitions()}
              </TabsTrigger>
              <TabsTrigger value="ledger">{m.currency_ledger()}</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link to="/currency/create">
                  <Plus className="size-4" />
                  {m.currency_new_definition()}
                </Link>
              </Button>
            </div>
          </div>

          <TabsContent value="definitions" className="mt-6">
            <DefinitionTable />
          </TabsContent>

          <TabsContent value="ledger" className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ledger-user">{m.currency_end_user_id()}</Label>
                <Input
                  id="ledger-user"
                  value={ledgerUser}
                  onChange={(e) => setLedgerUser(e.target.value)}
                  placeholder="user-42"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ledger-currency">
                  {m.currency_currency()}
                </Label>
                <select
                  id="ledger-currency"
                  value={ledgerCurrency}
                  onChange={(e) => setLedgerCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">{m.currency_filter_all()}</option>
                  {(allCurrencies ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
              {ledgerPending ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {m.common_loading()}
                </div>
              ) : ledgerError ? (
                <div className="p-6 text-sm text-destructive">
                  {ledgerError.message}
                </div>
              ) : (
                <LedgerTable
                  data={ledger?.items ?? []}
                  resolveCurrencyName={(id) => currencyNameById.get(id) ?? id}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
