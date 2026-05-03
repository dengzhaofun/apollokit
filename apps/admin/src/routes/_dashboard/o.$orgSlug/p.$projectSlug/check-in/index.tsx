import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { CalendarCheckIcon, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { ConfigForm } from "#/components/check-in/ConfigForm"
import { ConfigTable } from "#/components/check-in/ConfigTable"
import { useConfigForm } from "#/components/check-in/use-config-form"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { Can } from "#/components/auth/Can"
import { useCreateCheckInConfig } from "#/hooks/use-check-in"
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
const FORM_ID = "check-in-config-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/check-in/")({
  component: CheckInListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function CheckInListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal

  function closeModal() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...openCreateModal }) })
  }

  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  // Map scope kind → server filter. The scope filter doesn't carry an
  // activityId for "standalone" — useCheckInConfigs's default filters
  // out activity-bound configs.
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarCheckIcon className="size-5" />}
        title={t("签到配置", "Check-in")}
        description={t(
          "签到配置分页 / 搜索均走服务端。",
          "Check-in configs are paginated server-side.",
        )}
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Can resource="checkIn" action="write" mode="disable">
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.checkin_new_config()}
              </Button>
            </Can>
          </>
        }
      />

      <PageBody>
        <ConfigTable
          route={Route}
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>

      {modal === "create" ? (
        <CreateCheckInDrawer onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

function CreateCheckInDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const mutation = useCreateCheckInConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  // Lift the form instance out of `ConfigForm` so the AI panel can
  // call `form.setFieldValue(...)` to write back proposed configs.
  const form = useConfigForm({
    onSubmit: async (values) => {
      try {
        const row = await mutation.mutateAsync(values)
        toast.success("Check-in created")
        onClose()
        void navigate({
          to: "/o/$orgSlug/p/$projectSlug/check-in/$configId",
          params: { configId: row.id },
          hash: "rewards",
        })
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
      title={m.checkin_new_config()}
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
      <ConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        form={form}
      />
      <p className="mt-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
        {m.reward_create_hint()}
      </p>
    </FormDrawerWithAssist>
  )
}
