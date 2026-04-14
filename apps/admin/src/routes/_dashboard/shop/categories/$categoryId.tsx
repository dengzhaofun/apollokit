import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { CategoryForm } from "#/components/shop/CategoryForm"
import { ShopDeleteDialog } from "#/components/shop/DeleteDialog"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useDeleteShopCategory,
  useShopCategories,
  useShopCategory,
  useUpdateShopCategory,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/categories/$categoryId")(
  {
    component: ShopCategoryEditPage,
  },
)

function ShopCategoryEditPage() {
  const { categoryId } = Route.useParams()
  const navigate = useNavigate()
  const { data: category, isPending, error } = useShopCategory(categoryId)
  const { data: categories } = useShopCategories()
  const updateMutation = useUpdateShopCategory()
  const deleteMutation = useDeleteShopCategory()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">
          {category ? category.name : m.shop_edit_category()}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {category ? (
            <ShopDeleteDialog
              title={m.shop_delete_category_title()}
              description={m.shop_delete_category_desc()}
              isPending={deleteMutation.isPending}
              onConfirm={async () => {
                try {
                  await deleteMutation.mutateAsync(category.id)
                  toast.success(m.shop_category_deleted())
                  navigate({ to: "/shop/categories" })
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : m.shop_failed_delete_category(),
                  )
                }
              }}
            />
          ) : null}
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop/categories">
              <ArrowLeft className="size-4" />
              {m.shop_back_to_categories()}
            </Link>
          </Button>

          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error || !category ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {error?.message ?? m.shop_failed_load_categories()}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <CategoryForm
                parents={categories ?? []}
                excludeId={category.id}
                defaultValues={{
                  parentId: category.parentId,
                  alias: category.alias,
                  name: category.name,
                  description: category.description,
                  coverImage: category.coverImage,
                  icon: category.icon,
                  sortOrder: category.sortOrder,
                  isActive: category.isActive,
                }}
                isPending={updateMutation.isPending}
                submitLabel={m.common_save_changes()}
                onSubmit={async (input) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: category.id,
                      ...input,
                    })
                    toast.success(m.shop_category_updated())
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.shop_failed_update_category(),
                    )
                  }
                }}
              />
            </div>
          )}
        </div>
      </main>
    </>
  )
}
