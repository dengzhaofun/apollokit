import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { StorageBoxConfigForm } from "#/components/storage-box/StorageBoxConfigForm"
import { useCreateStorageBoxConfig } from "#/hooks/use-storage-box"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/storage-box/configs/create")({
  component: StorageBoxCreatePage,
})

function StorageBoxCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateStorageBoxConfig()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.storage_box_create_title()}</h1>
      </header>

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
