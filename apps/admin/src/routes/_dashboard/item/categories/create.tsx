import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { CategoryForm } from "#/components/item/CategoryForm"
import { useCreateItemCategory } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/item/categories/create")({
  component: CreateCategoryPage,
})

function CreateCategoryPage() {
  const navigate = useNavigate()
  const createMutation = useCreateItemCategory()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.item_new_category()}</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <CategoryForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.item_category_created())
                navigate({ to: "/item" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.item_failed_create_category())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
