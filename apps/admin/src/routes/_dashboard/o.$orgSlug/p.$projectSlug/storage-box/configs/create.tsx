import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { StorageBoxConfigForm } from "#/components/storage-box/StorageBoxConfigForm"
import { useCreateStorageBoxConfig } from "#/hooks/use-storage-box"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/storage-box/configs/create")({
  component: StorageBoxCreatePage,
})

function StorageBoxCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateStorageBoxConfig()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <StorageBoxConfigForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.storage_box_toast_create_success())
                navigate({ to: "/storage-box" })
              } catch (err) {
                toast.error(
                  err instanceof ApiError
                    ? err.body.error
                    : m.storage_box_toast_create_failed(),
                )
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
