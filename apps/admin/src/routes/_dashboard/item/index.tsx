import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { CategoryTable } from "#/components/item/CategoryTable"
import { DefinitionTable } from "#/components/item/DefinitionTable"
import { useItemCategories, useItemDefinitions } from "#/hooks/use-item"

export const Route = createFileRoute("/_dashboard/item/")({
  component: ItemListPage,
})

function ItemListPage() {
  const { data: categories, isPending: catPending, error: catError } = useItemCategories()
  const { data: definitions, isPending: defPending, error: defError } = useItemDefinitions()

  return (
    <>
      <main className="flex-1 p-6">
        <Tabs defaultValue="definitions">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="definitions">{m.item_definitions()}</TabsTrigger>
              <TabsTrigger value="categories">{m.item_categories()}</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link to="/item/definitions/create">
                  <Plus className="size-4" />
                  {m.item_new_definition()}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/item/categories/create">
                  <Plus className="size-4" />
                  {m.item_new_category()}
                </Link>
              </Button>
            </div>
          </div>

          <TabsContent value="definitions" className="mt-4">
            {defPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : defError ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {m.item_failed_load_definitions()} {defError.message}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <DefinitionTable data={definitions ?? []} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            {catPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : catError ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {m.item_failed_load_categories()} {catError.message}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <CategoryTable data={categories ?? []} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
