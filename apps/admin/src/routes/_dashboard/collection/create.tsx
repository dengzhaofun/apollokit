import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { AlbumForm } from "#/components/collection/AlbumForm"
import { Button } from "#/components/ui/button"
import { useCreateCollectionAlbum } from "#/hooks/use-collection"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/collection/create")({
  component: CollectionCreatePage,
})

function CollectionCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateCollectionAlbum()

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/collection">
              <ArrowLeft className="size-4" />
            </Link>
          }
          variant="ghost" size="icon"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <AlbumForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                const row = await createMutation.mutateAsync(values)
                toast.success(m.collection_album_created())
                navigate({
                  to: "/collection/$albumId",
                  params: { albumId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.collection_failed_create())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
