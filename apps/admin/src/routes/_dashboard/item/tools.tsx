import { createFileRoute } from "@tanstack/react-router"
import * as m from "#/paraglide/messages.js"

import { InventoryLookup } from "#/components/item/InventoryLookup"
import { GrantDeductForm } from "#/components/item/GrantDeductForm"

export const Route = createFileRoute("/_dashboard/item/tools")({
  component: ItemToolsPage,
})

function ItemToolsPage() {
  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">{m.item_inventory_lookup()}</h2>
            <InventoryLookup />
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">{m.item_grant_deduct()}</h2>
            <GrantDeductForm />
          </div>
        </div>
      </main>
    </>
  )
}
