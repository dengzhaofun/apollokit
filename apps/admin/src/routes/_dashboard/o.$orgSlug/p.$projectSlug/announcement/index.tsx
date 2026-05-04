import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { MegaphoneIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { AnnouncementForm } from "#/components/announcement/AnnouncementForm"
import { AnnouncementTable } from "#/components/announcement/AnnouncementTable"
import { useAnnouncementForm } from "#/components/announcement/use-announcement-form"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { Can } from "#/components/auth/Can"
import {
  useAnnouncement,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from "#/hooks/use-announcement"
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
const FORM_ID = "announcement-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/announcement/")({
  component: AnnouncementListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function AnnouncementListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingAlias = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...openCreateModal }) })
  }

  return (
    <PageShell>
      <PageHeader
        icon={<MegaphoneIcon className="size-5" />}
        title={t("公告", "Announcements")}
        description={t(
          "搜索 / 筛选 / 翻页均走服务端,全部状态写入 URL。",
          "Search, filter, and pagination are server-driven; all state lives in the URL.",
        )}
        actions={
          <Can resource="announcement" action="write" mode="disable">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.announcement_new()}
            </Button>
          </Can>
        }
      />

      <PageBody>
        <AnnouncementTable route={Route} />
      </PageBody>

      {modal === "create" ? (
        <CreateAnnouncementDrawer onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingAlias ? (
        <EditAnnouncementDrawer alias={editingAlias} onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

interface DrawerShellProps {
  onClose: () => void
}

function CreateAnnouncementDrawer({ onClose }: DrawerShellProps) {
  const mutation = useCreateAnnouncement()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useAnnouncementForm({
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
        toast.success("Announcement created")
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to create",
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
      title={m.announcement_new()}
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
      <AnnouncementForm
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

function EditAnnouncementDrawer({
  alias,
  onClose,
}: DrawerShellProps & { alias: string }) {
  const { data: ann, isPending: loading, error } = useAnnouncement(alias)

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !ann) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? "Announcement not found"}
      </div>
    )
  }
  return <EditAnnouncementDrawerLoaded ann={ann} onClose={onClose} />
}

function EditAnnouncementDrawerLoaded({
  ann,
  onClose,
}: DrawerShellProps & { ann: NonNullable<ReturnType<typeof useAnnouncement>["data"]> }) {
  const mutation = useUpdateAnnouncement()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useAnnouncementForm({
    initial: ann,
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync({ alias: ann.alias, input: values })
        toast.success("Announcement updated")
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
            disabled={!form.state.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_save_changes()}
          </Button>
        </>
      }
    >
      <AnnouncementForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        aliasLocked
        isPending={mutation.isPending}
        submitLabel={m.common_save_changes()}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
