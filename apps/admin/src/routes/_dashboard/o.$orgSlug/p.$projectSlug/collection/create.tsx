import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { AlbumForm } from "#/components/collection/AlbumForm"
import { Button } from "#/components/ui/button"
import { useCreateCollectionAlbum } from "#/hooks/use-collection"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeader, PageBody, PageShell } from "#/components/patterns"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/collection/create")({
  component: CollectionCreatePage,
})

function CollectionCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateCollectionAlbum()
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <PageShell>
      <PageHeader
        title={m.common_create()}
        actions={
          <>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/collection" params={{ orgSlug, projectSlug }}>
                  <ArrowLeft className="size-4" />
                </Link>
              }
              variant="ghost" size="icon"
            />
          </>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <AlbumForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                const row = await createMutation.mutateAsync(values)
                toast.success(m.collection_album_created())
                navigate({
                  to: "/o/$orgSlug/p/$projectSlug/collection/$albumId",
                  params: { orgSlug, projectSlug, albumId: row.id },
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
      </PageBody>
    </PageShell>
  )
}
