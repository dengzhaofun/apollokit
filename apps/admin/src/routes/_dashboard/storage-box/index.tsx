import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { StorageBoxConfigTable } from "#/components/storage-box/StorageBoxConfigTable"
import { StorageBoxDepositLookup } from "#/components/storage-box/StorageBoxDepositLookup"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/storage-box/")({
  component: StorageBoxListPage,
})

function StorageBoxListPage() {
  return (
    <>
      <main className="flex-1 p-6">
        <Tabs defaultValue="configs">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="configs">{m.storage_box_tab_configs()}</TabsTrigger>
              <TabsTrigger value="deposits">{m.storage_box_tab_deposits()}</TabsTrigger>
            </TabsList>
            <Button asChild size="sm">
              <Link to="/storage-box/configs/create">
                <Plus className="size-4" />
                {m.storage_box_action_create()}
              </Link>
            </Button>
          </div>

          <TabsContent value="configs" className="mt-4">
            <StorageBoxConfigTable />
          </TabsContent>

          <TabsContent value="deposits" className="mt-4">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <StorageBoxDepositLookup />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
