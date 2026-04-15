import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { AlbumTable } from "#/components/collection/AlbumTable"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { useCollectionAlbums } from "#/hooks/use-collection"

export const Route = createFileRoute("/_dashboard/collection/")({
  component: CollectionListPage,
})

function CollectionListPage() {
  const { data: items, isPending, error } = useCollectionAlbums()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">图鉴</h1>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/collection/create">
              <Plus className="size-4" />
              新建图鉴
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            加载失败: {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <AlbumTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
