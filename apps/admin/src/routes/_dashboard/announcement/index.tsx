import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { MegaphoneIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { AnnouncementForm } from "#/components/announcement/AnnouncementForm"
import { AnnouncementTable } from "#/components/announcement/AnnouncementTable"
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
  useAnnouncement,
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from "#/hooks/use-announcement"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "announcement-form"

export const Route = createFileRoute("/_dashboard/announcement/")({
  component: AnnouncementListPage,
  validateSearch: modalSearchSchema,
})

function AnnouncementListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingAlias = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const { data: items, isPending, error, refetch } = useAnnouncements()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<MegaphoneIcon className="size-5" />}
        title={t("公告", "Announcements")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 条公告`, `${total} announcements total`)
        }
        actions={
          <WriteGate>
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.announcement_new()}
            </Button>
          </WriteGate>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.announcement_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("公告加载失败", "Failed to load announcements")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有公告", "No announcements yet")}
            description={t(
              "发布第一条公告,触达全体玩家。",
              "Publish your first announcement to reach all players.",
            )}
            action={
              <WriteGate>
                <Button size="sm" onClick={openCreate}>
                  <Plus />
                  {m.announcement_new()}
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <AnnouncementTable data={items ?? []} />
          </div>
        )}
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

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.announcement_new()}
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
      <AnnouncementForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        submitLabel={m.common_create()}
        onSubmit={async (values) => {
          try {
            await mutation.mutateAsync(values)
            toast.success("Announcement created")
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

function EditAnnouncementDrawer({
  alias,
  onClose,
}: DrawerShellProps & { alias: string }) {
  const { data: ann, isPending: loading, error } = useAnnouncement(alias)
  const mutation = useUpdateAnnouncement()
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
            disabled={!ann || !formState.canSubmit || mutation.isPending}
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
      ) : error || !ann ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Announcement not found"}
        </div>
      ) : (
        <AnnouncementForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          aliasLocked
          initial={ann}
          isPending={mutation.isPending}
          submitLabel={m.common_save_changes()}
          onSubmit={async (values) => {
            try {
              await mutation.mutateAsync({ alias: ann.alias, input: values })
              toast.success("Announcement updated")
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
