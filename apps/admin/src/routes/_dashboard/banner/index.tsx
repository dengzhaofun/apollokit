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
import { GroupTable } from "#/components/banner/GroupTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import {
  useBannerGroup,
  useBannerGroups,
  useCreateBannerGroup,
  useUpdateBannerGroup,
} from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "banner-group-form"

export const Route = createFileRoute("/_dashboard/banner/")({
  component: BannerListPage,
  validateSearch: modalSearchSchema,
})

function BannerListPage() {
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

  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: items, isPending, error, refetch } = useBannerGroups(
    scopeToFilter(scope),
  )

  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<GalleryHorizontalIcon className="size-5" />}
        title={t("Banner 组", "Banner groups")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个 banner 组`, `${total} groups total`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("Banner 组加载失败", "Failed to load banner groups")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有 Banner 组", "No banner groups yet")}
            description={t(
              "创建第一个 banner 组,集中管理首页轮播图、活动 hero。",
              "Create your first group to manage carousels and hero banners.",
            )}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.banner_new_group()}
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <GroupTable data={items ?? []} />
          </div>
        )}
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
  const mutation = useCreateBannerGroup()
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
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.banner_new_group()}
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
        onSubmit={async (values) => {
          try {
            const row = await mutation.mutateAsync(values)
            toast.success(m.banner_group_created())
            onClose()
            void navigate({
              to: "/banner/$groupId",
              params: { groupId: row.id },
            })
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.body.error
                : m.banner_failed_create_group(),
            )
          }
        }}
      />
    </FormDialog>
  )
}

function EditBannerGroupDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: group, isPending: loading, error } = useBannerGroup(id)
  const mutation = useUpdateBannerGroup()
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
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.common_edit()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!group || !formState.canSubmit || mutation.isPending}
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
      ) : error || !group ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Banner group not found"}
        </div>
      ) : (
        <GroupForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          initial={group}
          isPending={mutation.isPending}
          submitLabel={m.common_save_changes()}
          onSubmit={async (values) => {
            try {
              await mutation.mutateAsync({ id: group.id, input: values })
              toast.success("Banner group updated")
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.body.error : "Failed to update",
              )
            }
          }}
        />
      )}
    </FormDialog>
  )
}
