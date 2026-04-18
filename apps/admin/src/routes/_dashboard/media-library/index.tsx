import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { AssetGrid } from "#/components/media-library/AssetGrid"
import { FolderTree } from "#/components/media-library/FolderTree"
import { UploadButton } from "#/components/media-library/UploadButton"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/media-library/")({
  component: MediaLibraryPage,
})

function MediaLibraryPage() {
  // `null` = root folder in the tree view; the server's listAssets
  // falls back to the default upload folder when folderId is null.
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.media_header_title()}</h1>
        <div className="ml-auto">
          <UploadButton folderId={selectedFolderId} />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r bg-card">
          <FolderTree
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        </aside>
        <section className="flex-1 overflow-y-auto p-6">
          <AssetGrid folderId={selectedFolderId} />
        </section>
      </main>
    </>
  )
}
