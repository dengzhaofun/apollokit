import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { SchemaTable } from "#/components/entity/SchemaTable"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
  useEntitySchemas,
  useEntityFormationConfigs,
} from "#/hooks/use-entity"
import { FormationConfigTable } from "#/components/entity/FormationConfigTable"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/entity/")({
  component: EntityListPage,
})

function EntityListPage() {
  const { data: schemas, isPending: schemasPending, error: schemasError } = useEntitySchemas()
  const { data: formations, isPending: formPending, error: formError } = useEntityFormationConfigs()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.entity_title()}</h1>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="schemas">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="schemas">{m.entity_schemas()}</TabsTrigger>
              <TabsTrigger value="formations">{m.entity_formations()}</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link to="/entity/schemas/create">
                  <Plus className="size-4" />
                  {m.entity_new_schema()}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/entity/formations/create">
                  <Plus className="size-4" />
                  {m.entity_new_formation()}
                </Link>
              </Button>
            </div>
          </div>

          <TabsContent value="schemas">
            {schemasPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : schemasError ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {schemasError.message}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <SchemaTable data={schemas ?? []} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="formations">
            {formPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : formError ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {formError.message}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <FormationConfigTable data={formations ?? []} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
