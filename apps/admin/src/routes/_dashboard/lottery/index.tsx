import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { DicesIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { useLotteryPoolForm } from "#/components/lottery/use-pool-form"
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { useCreateLotteryPool } from "#/hooks/use-lottery"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import { getLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "lottery-pool-form"

export const Route = createFileRoute("/_dashboard/lottery/")({
  component: LotteryListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function LotteryListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<DicesIcon className="size-5" />}
        title={t("抽奖池", "Lottery pools")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {t("新建抽奖池", "New pool")}
            </Button>
          </>
        }
      />

      <PageBody>
        <LotteryPoolTable
          route={Route}
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>

      {modal === "create" ? (
        <CreateLotteryPoolDialog onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

function CreateLotteryPoolDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const mutation = useCreateLotteryPool()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useLotteryPoolForm({
    onSubmit: async (values) => {
      try {
        const row = await mutation.mutateAsync(values)
        toast.success("Pool created")
        onClose()
        void navigate({
          to: "/lottery/$poolId",
          params: { poolId: row.id },
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
      title={t("新建抽奖池", "New pool")}
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
      <LotteryPoolForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
