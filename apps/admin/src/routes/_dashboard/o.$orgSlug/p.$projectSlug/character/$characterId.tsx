import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CharacterForm } from "#/components/character/CharacterForm"
import { useCharacterForm } from "#/components/character/use-character-form"
import { PageHeader } from "#/components/patterns"
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
import { Button } from "#/components/ui/button"
import {
  useCharacter,
  useDeleteCharacter,
  useUpdateCharacter,
} from "#/hooks/use-character"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/character/$characterId")({
  component: CharacterDetailPage,
})

function CharacterDetailPage() {
  const { characterId } = Route.useParams()
  const navigate = useNavigate()
  const { data: character, isPending } = useCharacter(characterId)
  const updateMutation = useUpdateCharacter()
  const deleteMutation = useDeleteCharacter()
  const { orgSlug, projectSlug } = useTenantParams()
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(characterId)
      toast.success(m.character_deleted())
      navigate({ to: "/o/$orgSlug/p/$projectSlug/character" , params: { orgSlug, projectSlug }})
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.character_failed_delete())
    }
  }

  return (
    <>
      <PageHeader
        title={character?.name ?? m.character_back_to_list()}
        actions={<>
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/character" params={{ orgSlug, projectSlug }}>
                <ArrowLeft className="size-4" />
                {m.character_back_to_list()}
              </Link>
            }
            variant="ghost" size="sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Button>
        </>}
      />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          {isPending || !character ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : (
            <EditCharacterPanel
              character={character}
              isPending={updateMutation.isPending}
              onSave={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: characterId,
                    input: values,
                  })
                  toast.success(m.character_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.character_failed_update())
                }
              }}
            />
          )}
        </div>
      </main>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.character_delete_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.character_delete_desc()}
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
    </>
  )
}

/**
 * Edit form lifted into a sub-component so `useCharacterForm` runs only
 * when we have data and is keyed by character.
 */
function EditCharacterPanel({
  character,
  isPending,
  onSave,
}: {
  character: NonNullable<ReturnType<typeof useCharacter>["data"]>
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useCharacterForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useCharacterForm({ initial: character, onSubmit: onSave })
  return (
    <CharacterForm
      form={form}
      isPending={isPending}
      submitLabel={m.common_save_changes()}
    />
  )
}
