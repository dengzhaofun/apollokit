import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { ScriptEditor } from "#/components/dialogue/ScriptEditor"
import { Button } from "#/components/ui/button"
import { useCreateDialogueScript } from "#/hooks/use-dialogue"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/dialogue/create")({
  component: DialogueCreatePage,
})

function DialogueCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateDialogueScript()

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/dialogue">
              <ArrowLeft className="size-4" />
              {m.dialogue_back_to_scripts()}
            </Link>
          }
          variant="ghost" size="sm"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl">
          <ScriptEditor
            isPending={mutation.isPending}
            submitLabel={m.common_create()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.dialogue_script_created())
                navigate({
                  to: "/dialogue/$scriptId",
                  params: { scriptId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.dialogue_failed_create_script())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
