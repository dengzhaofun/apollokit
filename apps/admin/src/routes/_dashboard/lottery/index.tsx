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
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
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
  useCreateLotteryPool,
  useLotteryPools,
} from "#/hooks/use-lottery"
import { ApiError } from "#/lib/api-client"
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
  validateSearch: modalSearchSchema,
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
  const { data: pools, isPending, error, refetch } = useLotteryPools(
    scopeToFilter(scope),
  )
  const total = pools?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<DicesIcon className="size-5" />}
        title={t("抽奖池", "Lottery pools")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个抽奖池`, `${total} pools total`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {t("加载中…", "Loading…")}
          </div>
        ) : error ? (
          <ErrorState
            title={t("抽奖池加载失败", "Failed to load lottery pools")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有抽奖池", "No lottery pools yet")}
            description={t(
              "创建第一个抽奖池,设置奖品和概率分布。",
              "Create your first pool with prize tiers and probability distribution.",
            )}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {t("新建抽奖池", "New pool")}
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <LotteryPoolTable data={pools ?? []} />
          </div>
        )}
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

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={t("新建抽奖池", "New pool")}
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
        onSubmit={async (values) => {
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
        }}
      />
    </FormDialog>
  )
}
