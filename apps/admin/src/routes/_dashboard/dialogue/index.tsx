import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { ScriptTable } from "#/components/dialogue/ScriptTable"
import { Button } from "#/components/ui/button"
import { useDialogueScripts } from "#/hooks/use-dialogue"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/dialogue/")({
  component: DialogueListPage,
})

function DialogueListPage() {
  const { data: items, isPending, error } = useDialogueScripts()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/dialogue/create">
              <Plus className="size-4" />
              {m.dialogue_new_script()}
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
            {m.dialogue_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <ScriptTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
