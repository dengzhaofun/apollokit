import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ContactIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { CharacterForm } from "#/components/character/CharacterForm"
import { useCharacterForm } from "#/components/character/use-character-form"
import { CharacterTable } from "#/components/character/CharacterTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import {
  useCharacter,
  useCreateCharacter,
  useUpdateCharacter,
} from "#/hooks/use-character"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "character-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/character/")({
  component: CharacterListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function CharacterListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingId = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...openCreateModal }) })
  }

  return (
    <PageShell>
      <PageHeader
        icon={<ContactIcon className="size-5" />}
        title={t("角色", "Characters")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            {m.character_new()}
          </Button>
        }
      />

      <PageBody>
        <CharacterTable route={Route} />
      </PageBody>

      {modal === "create" ? (
        <CreateCharacterDrawer onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditCharacterDrawer id={editingId} onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

interface DrawerShellProps {
  onClose: () => void
}

function CreateCharacterDrawer({ onClose }: DrawerShellProps) {
  const mutation = useCreateCharacter()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useCharacterForm({
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
        toast.success(m.character_created())
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : m.character_failed_create(),
        )
      }
    },
  })

  return (
    <FormDrawerWithAssist
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.character_new()}
      form={form}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <CharacterForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        submitLabel={m.common_create()}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}

function EditCharacterDrawer({
  id,
  onClose,
}: DrawerShellProps & { id: string }) {
  const { data: character, isPending: loading, error } = useCharacter(id)

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !character) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? "Character not found"}
      </div>
    )
  }
  return <EditCharacterDrawerLoaded character={character} onClose={onClose} />
}

function EditCharacterDrawerLoaded({
  character,
  onClose,
}: DrawerShellProps & { character: NonNullable<ReturnType<typeof useCharacter>["data"]> }) {
  const mutation = useUpdateCharacter()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useCharacterForm({
    initial: character,
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync({ id: character.id, input: values })
        toast.success("Character updated")
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to update",
        )
      }
    },
  })

  return (
    <FormDrawerWithAssist
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.common_edit()}
      form={form}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_save_changes()}
          </Button>
        </>
      }
    >
      <CharacterForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        submitLabel={m.common_save_changes()}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
