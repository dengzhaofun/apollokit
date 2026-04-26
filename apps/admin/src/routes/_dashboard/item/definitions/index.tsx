import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { PackageIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { DefinitionForm } from "#/components/item/DefinitionForm"
import { DefinitionTable } from "#/components/item/DefinitionTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import { WriteGate } from "#/components/WriteGate"
import {
  useCreateItemDefinition,
  useItemDefinition,
  useItemDefinitions,
  useUpdateItemDefinition,
} from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "item-definition-form"

export const Route = createFileRoute("/_dashboard/item/definitions/")({
  component: ItemDefinitionsPage,
  validateSearch: modalSearchSchema,
})

function ItemDefinitionsPage() {
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

  const { data: definitions, isPending, error, refetch } = useItemDefinitions()
  const total = definitions?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<PackageIcon className="size-5" />}
        title={t("物品定义", "Item definitions")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个定义`, `${total} definitions total`)
        }
        actions={
          <WriteGate>
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.item_new_definition()}
            </Button>
          </WriteGate>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("物品定义加载失败", "Failed to load definitions")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有物品定义", "No item definitions yet")}
            description={t(
              "创建第一个物品定义,后续 shop / reward / inventory 都基于它。",
              "Create your first definition to power shop / reward / inventory.",
            )}
            action={
              <WriteGate>
                <Button size="sm" onClick={openCreate}>
                  <Plus />
                  {m.item_new_definition()}
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <DefinitionTable data={definitions ?? []} />
          </div>
        )}
      </PageBody>

      {modal === "create" ? (
        <CreateDefinitionDrawer onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditDefinitionDrawer id={editingId} onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

interface DrawerShellProps {
  onClose: () => void
}

function CreateDefinitionDrawer({ onClose }: DrawerShellProps) {
  const mutation = useCreateItemDefinition()
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
      title={m.item_new_definition()}
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
      <DefinitionForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        onSubmit={async (values) => {
          try {
            await mutation.mutateAsync(values)
            toast.success("Definition created")
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError ? err.body.error : "Failed to create",
            )
          }
        }}
      />
    </FormDrawer>
  )
}

function EditDefinitionDrawer({
  id,
  onClose,
}: DrawerShellProps & { id: string }) {
  const { data: def, isPending: loading, error } = useItemDefinition(id)
  const mutation = useUpdateItemDefinition()
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
            disabled={!def || !formState.canSubmit || mutation.isPending}
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
      ) : error || !def ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Definition not found"}
        </div>
      ) : (
        <DefinitionForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          defaultValues={{
            name: def.name,
            alias: def.alias,
            categoryId: def.categoryId,
            description: def.description,
            icon: def.icon,
            stackable: def.stackable,
            stackLimit: def.stackLimit,
            holdLimit: def.holdLimit,
            isActive: def.isActive,
            activityId: def.activityId,
          }}
          isPending={mutation.isPending}
          onSubmit={async (values) => {
            try {
              await mutation.mutateAsync({ id: def.id, ...values })
              toast.success("Definition updated")
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
