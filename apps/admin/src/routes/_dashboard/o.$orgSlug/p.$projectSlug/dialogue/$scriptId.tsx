import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ScriptEditor } from "#/components/dialogue/ScriptEditor"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  useDeleteDialogueScript,
  useDialogueScript,
  useUpdateDialogueScript,
} from "#/hooks/use-dialogue"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeader, PageBody, PageShell } from "#/components/patterns"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/dialogue/$scriptId")({
  component: DialogueDetailPage,
})

function DialogueDetailPage() {
  const { scriptId } = Route.useParams()
  const navigate = useNavigate()
  const { data: script, isPending } = useDialogueScript(scriptId)
  const updateMutation = useUpdateDialogueScript()
  const deleteMutation = useDeleteDialogueScript()
  const { orgSlug, projectSlug } = useTenantParams()
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(scriptId)
      toast.success(m.dialogue_script_deleted())
      navigate({ to: "/o/$orgSlug/p/$projectSlug/dialogue" , params: { orgSlug, projectSlug }})
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.dialogue_failed_delete_script())
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={script?.alias ?? scriptId}
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
            {script && !script.alias ? (
              <Badge variant="outline">{m.dialogue_draft_badge()}</Badge>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {m.common_delete()}
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-7xl">
          {isPending || !script ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : (
            <ScriptEditor
              initial={script}
              isPending={updateMutation.isPending}
              submitLabel={m.dialogue_save_script()}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: scriptId,
                    input: values,
                  })
                  toast.success(m.dialogue_script_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.dialogue_failed_update_script())
                }
              }}
            />
          )}
        </div>
      </PageBody>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.dialogue_delete_script_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.dialogue_delete_script_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
