import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { StorageBoxConfigTable } from "#/components/storage-box/StorageBoxConfigTable"
import { StorageBoxDepositLookup } from "#/components/storage-box/StorageBoxDepositLookup"
import { useStorageBoxConfigs } from "#/hooks/use-storage-box"

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
        <h1 className="text-sm font-semibold">存储箱</h1>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="configs">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="configs">配置列表</TabsTrigger>
              <TabsTrigger value="deposits">用户存款查询</TabsTrigger>
            </TabsList>
            <Button asChild size="sm">
              <Link to="/storage-box/configs/create">
                <Plus className="size-4" />
                新建存储箱
              </Link>
            </Button>
          </div>

          <TabsContent value="configs" className="mt-4">
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                加载中...
              </div>
            ) : error ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                加载失败：{error.message}
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
