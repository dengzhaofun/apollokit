import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { PageHeader } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import { Can } from "#/components/auth/Can"
import { CategoryForm } from "#/components/item/CategoryForm"
import { CategoryTable } from "#/components/item/CategoryTable"
import {
  useCreateItemCategory,
  useItemCategory,
  useUpdateItemCategory,
} from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import { closedModal, modalSearchSchema, openCreateModal } from "#/lib/modal-search"

const FORM_ID = "item-category-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/item/categories/")({
  component: ItemCategoriesPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function ItemCategoriesPage() {
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
    <>
      <PageHeader
        title={m.item_categories()}
        actions={
          <Can resource="item" action="write" mode="disable">
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {m.item_new_category()}
            </Button>
          </Can>
        }
      />

      <main className="flex-1 p-6">
        <CategoryTable route={Route} />
      </main>

      {modal === "create" ? (
        <CreateCategoryDialog onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditCategoryDialog id={editingId} onClose={closeModal} />
      ) : null}
    </>
  )
}

interface DialogShellProps {
  onClose: () => void
}

function CreateCategoryDialog({ onClose }: DialogShellProps) {
  const createMutation = useCreateItemCategory()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !createMutation.isPending}
      title={m.item_new_category()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <CategoryForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={createMutation.isPending}
        onSubmit={async (values) => {
          try {
            await createMutation.mutateAsync(values)
            toast.success(m.item_category_created())
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.body.error
                : m.item_failed_create_category(),
            )
          }
        }}
      />
    </FormDialog>
  )
}

function EditCategoryDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: category, isPending: loading, error } = useItemCategory(id)
  const updateMutation = useUpdateItemCategory()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !updateMutation.isPending}
      title={m.common_edit()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={
              !category ||
              !formState.canSubmit ||
              updateMutation.isPending
            }
          >
            {updateMutation.isPending ? m.common_saving() : m.common_save_changes()}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error || !category ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? m.item_failed_load_categories()}
        </div>
      ) : (
        <CategoryForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          defaultValues={{
            name: category.name,
            alias: category.alias,
            icon: category.icon,
            isActive: category.isActive,
          }}
          isPending={updateMutation.isPending}
          onSubmit={async (values) => {
            try {
              await updateMutation.mutateAsync({ id: category.id, ...values })
              toast.success(m.item_category_updated())
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError
                  ? err.body.error
                  : "Failed to update category",
              )
            }
          }}
        />
      )}
    </FormDialog>
  )
}
