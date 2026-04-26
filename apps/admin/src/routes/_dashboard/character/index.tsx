import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ContactIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { CharacterForm } from "#/components/character/CharacterForm"
import { CharacterTable } from "#/components/character/CharacterTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import {
  useCharacter,
  useCharacters,
  useCreateCharacter,
  useUpdateCharacter,
} from "#/hooks/use-character"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "character-form"

export const Route = createFileRoute("/_dashboard/character/")({
  component: CharacterListPage,
  validateSearch: modalSearchSchema,
})

function CharacterListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingId = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const { data: items, isPending, error, refetch } = useCharacters()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<ContactIcon className="size-5" />}
        title={t("角色", "Characters")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个角色`, `${total} characters total`)
        }
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            {m.character_new()}
          </Button>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("角色加载失败", "Failed to load characters")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有角色", "No characters yet")}
            description={t(
              "创建第一个角色,作为剧情对话和图鉴的基础。",
              "Create your first character as the basis for dialogues and collections.",
            )}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.character_new()}
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <CharacterTable data={items ?? []} />
          </div>
        )}
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

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.character_new()}
      size="lg"
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
        onSubmit={async (values) => {
          try {
            await mutation.mutateAsync(values)
            toast.success(m.character_created())
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError ? err.body.error : m.character_failed_create(),
            )
          }
        }}
      />
    </FormDrawer>
  )
}

function EditCharacterDrawer({
  id,
  onClose,
}: DrawerShellProps & { id: string }) {
  const { data: character, isPending: loading, error } = useCharacter(id)
  const mutation = useUpdateCharacter()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.common_edit()}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!character || !formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_save_changes()}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error || !character ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Character not found"}
        </div>
      ) : (
        <CharacterForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          initial={character}
          isPending={mutation.isPending}
          submitLabel={m.common_save_changes()}
          onSubmit={async (values) => {
            try {
              await mutation.mutateAsync({ id: character.id, input: values })
              toast.success("Character updated")
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.body.error : "Failed to update",
              )
            }
          }}
        />
      )}
    </FormDrawer>
  )
}
