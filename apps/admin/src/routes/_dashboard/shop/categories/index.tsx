import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { CategoryForm } from "#/components/shop/CategoryForm"
import { CategoryTree } from "#/components/shop/CategoryTree"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useCreateShopCategory,
  useShopCategories,
  useShopCategoryTree,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/categories/")({
  component: ShopCategoriesPage,
})

function ShopCategoriesPage() {
  const { data: tree, isPending, error } = useShopCategoryTree()
  const { data: categories } = useShopCategories()
  const createMutation = useCreateShopCategory()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.shop_categories()}</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop">
              <ArrowLeft className="size-4" />
              {m.shop_back_to_products()}
            </Link>
          </Button>

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
