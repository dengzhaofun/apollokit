import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { CharacterTable } from "#/components/character/CharacterTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { useCharacters } from "#/hooks/use-character"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/character/")({
  component: CharacterListPage,
})

function CharacterListPage() {
  const { data: items, isPending, error } = useCharacters()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/character/create">
              <Plus className="size-4" />
              {m.character_new()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.character_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <CharacterTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
