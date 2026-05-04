import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { GalleryHorizontalIcon, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { GroupForm } from "#/components/banner/GroupForm"
import { useGroupForm } from "#/components/banner/use-group-form"
import { GroupTable } from "#/components/banner/GroupTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import {
  useBannerGroup,
  useCreateBannerGroup,
  useUpdateBannerGroup,
} from "#/hooks/use-banner"
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
const FORM_ID = "banner-group-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/banner/")({
  component: BannerListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function BannerListPage() {
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

  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<GalleryHorizontalIcon className="size-5" />}
        title={t("Banner 组", "Banner groups")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.banner_new_group()}
            </Button>
          </>
        }
      />

      <PageBody>
        <GroupTable
          route={Route}
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>

      {modal === "create" ? (
        <CreateBannerGroupDialog onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditBannerGroupDialog id={editingId} onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

interface DialogShellProps {
  onClose: () => void
}

function CreateBannerGroupDialog({ onClose }: DialogShellProps) {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const mutation = useCreateBannerGroup()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useGroupForm({
    onSubmit: async (values) => {
      try {
        const row = await mutation.mutateAsync(values)
        toast.success(m.banner_group_created())
        onClose()
        void navigate({
          to: "/o/$orgSlug/p/$projectSlug/banner/$groupId",
          params: { orgSlug, projectSlug, groupId: row.id },
        })
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.body.error
            : m.banner_failed_create_group(),
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
      title={m.banner_new_group()}
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
      <GroupForm
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

function EditBannerGroupDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: group, isPending: loading, error } = useBannerGroup(id)
  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !group) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? "Banner group not found"}
      </div>
    )
  }
  return <EditBannerGroupDialogLoaded group={group} onClose={onClose} />
}

function EditBannerGroupDialogLoaded({
  group,
  onClose,
}: DialogShellProps & {
  group: NonNullable<ReturnType<typeof useBannerGroup>["data"]>
}) {
  const mutation = useUpdateBannerGroup()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useGroupForm({
    initial: group,
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync({ id: group.id, input: values })
        toast.success("Banner group updated")
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
      <GroupForm
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
