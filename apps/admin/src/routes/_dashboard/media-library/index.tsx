import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { AssetGrid } from "#/components/media-library/AssetGrid"
import { FolderTree } from "#/components/media-library/FolderTree"
import { UploadButton } from "#/components/media-library/UploadButton"
import { PageHeaderActions } from "#/components/PageHeader"

export const Route = createFileRoute("/_dashboard/media-library/")({
  component: MediaLibraryPage,
})

function MediaLibraryPage() {
  // `null` = root folder in the tree view; the server's listAssets
  // falls back to the default upload folder when folderId is null.
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <UploadButton folderId={selectedFolderId} />
        </div>
      </PageHeaderActions>

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
