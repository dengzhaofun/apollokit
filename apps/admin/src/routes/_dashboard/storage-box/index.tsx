import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { StorageBoxConfigTable } from "#/components/storage-box/StorageBoxConfigTable"
import { StorageBoxDepositLookup } from "#/components/storage-box/StorageBoxDepositLookup"
import { useStorageBoxConfigs } from "#/hooks/use-storage-box"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/storage-box/")({
  component: StorageBoxListPage,
})

function StorageBoxListPage() {
  const { data: configs, isPending, error } = useStorageBoxConfigs()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.storage_box_page_title()}</h1>
      </header>

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
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : error ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {m.common_failed_to_load({ resource: m.storage_box_page_title(), error: error.message })}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <StorageBoxConfigTable data={configs ?? []} />
              </div>
            )}
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
