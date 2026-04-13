import { createFileRoute } from "@tanstack/react-router"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { InventoryLookup } from "#/components/item/InventoryLookup"
import { GrantDeductForm } from "#/components/item/GrantDeductForm"

export const Route = createFileRoute("/_dashboard/item/tools")({
  component: ItemToolsPage,
})

function ItemToolsPage() {
  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">Item Tools</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Inventory Lookup</h2>
            <InventoryLookup />
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Grant / Deduct Items</h2>
            <GrantDeductForm />
          </div>
        </div>
      </main>
    </>
  )
}
