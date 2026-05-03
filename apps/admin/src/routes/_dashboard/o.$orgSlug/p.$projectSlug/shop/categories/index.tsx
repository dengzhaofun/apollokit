import { createFileRoute } from "@tanstack/react-router"
import { Link } from "#/components/router-helpers"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { CategoryForm } from "#/components/shop/CategoryForm"
import { CategoryTree } from "#/components/shop/CategoryTree"
import { Button } from "#/components/ui/button"
import {
  useCreateShopCategory,
  useShopCategories,
  useShopCategoryTree,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/shop/categories/")({
  component: ShopCategoriesPage,
})

function ShopCategoriesPage() {
  const { data: tree, isPending, error } = useShopCategoryTree()
  const { data: categories } = useShopCategories()
  const createMutation = useCreateShopCategory()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button
            render={
              <Link to="/shop">
                <ArrowLeft className="size-4" />
                {m.shop_back_to_products()}
              </Link>
            }
            variant="outline" size="sm"
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{m.shop_categories()}</h2>
            {isPending ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : error ? (
              <div className="flex h-24 items-center justify-center text-destructive">
                {error.message}
              </div>
            ) : (tree?.length ?? 0) === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
                {m.shop_no_categories()}
              </div>
            ) : (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <CategoryTree nodes={tree ?? []} />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{m.shop_new_category()}</h2>
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <CategoryForm
                parents={categories ?? []}
                isPending={createMutation.isPending}
                submitLabel={m.common_create()}
                onSubmit={async (input) => {
                  try {
                    await createMutation.mutateAsync(input)
                    toast.success(m.shop_category_created())
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.shop_failed_create_category(),
                    )
                  }
                }}
              />
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
