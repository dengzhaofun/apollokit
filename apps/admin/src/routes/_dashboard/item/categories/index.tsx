import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { CategoryTable } from "#/components/item/CategoryTable"
import { useItemCategories } from "#/hooks/use-item"

export const Route = createFileRoute("/_dashboard/item/categories/")({
  component: ItemCategoriesPage,
})

function ItemCategoriesPage() {
  const { data: categories, isPending, error } = useItemCategories()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/item/categories/create">
                <Plus className="size-4" />
                {m.item_new_category()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.item_failed_load_categories()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <CategoryTable data={categories ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
