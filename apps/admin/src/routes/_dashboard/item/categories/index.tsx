import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { CategoryTable } from "#/components/item/CategoryTable"

export const Route = createFileRoute("/_dashboard/item/categories/")({
  component: ItemCategoriesPage,
})

function ItemCategoriesPage() {
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
        <CategoryTable />
      </main>
    </>
  )
}
