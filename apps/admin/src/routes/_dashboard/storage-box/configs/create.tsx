import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { StorageBoxConfigForm } from "#/components/storage-box/StorageBoxConfigForm"
import { useCreateStorageBoxConfig } from "#/hooks/use-storage-box"
import { ApiError } from "#/lib/api-client"

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
        <h1 className="text-sm font-semibold">新建存储箱</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <StorageBoxConfigForm
            submitLabel="创建"
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success("存储箱已创建")
                navigate({ to: "/storage-box" })
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.body.error : "创建失败",
                )
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
