import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { ScriptEditor } from "#/components/dialogue/ScriptEditor"
import { Button } from "#/components/ui/button"
import { useCreateDialogueScript } from "#/hooks/use-dialogue"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeader, PageBody, PageShell } from "#/components/patterns"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/dialogue/create")({
  component: DialogueCreatePage,
})

function DialogueCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateDialogueScript()
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <PageShell>
      <PageHeader
        title={m.common_create()}
        actions={
          <>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/dialogue" params={{ orgSlug, projectSlug }}>
                  <ArrowLeft className="size-4" />
                  {m.dialogue_back_to_scripts()}
                </Link>
              }
              variant="ghost" size="sm"
            />
          </>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-7xl">
          <ScriptEditor
            isPending={mutation.isPending}
            submitLabel={m.common_create()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.dialogue_script_created())
                navigate({
                  to: "/o/$orgSlug/p/$projectSlug/dialogue/$scriptId",
                  params: { orgSlug, projectSlug, scriptId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.dialogue_failed_create_script())
              }
            }}
          />
        </div>
      </PageBody>
    </PageShell>
  )
}
