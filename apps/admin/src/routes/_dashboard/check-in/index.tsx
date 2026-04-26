import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
  useCheckInConfigs,
  useCreateCheckInConfig,
} from "#/hooks/use-check-in"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "check-in-config-form"

export const Route = createFileRoute("/_dashboard/check-in/")({
  component: CheckInListPage,
  validateSearch: modalSearchSchema,
})

function CheckInListPage() {
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
  const { data: configs, isPending, error, refetch } = useCheckInConfigs(
    scopeToFilter(scope),
  )

  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarCheckIcon className="size-5" />}
        title={t("签到配置", "Check-in")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个配置`, `${total} configs total`)
        }
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <WriteGate>
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.checkin_new_config()}
              </Button>
            </WriteGate>
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
            title={t("签到配置加载失败", "Failed to load check-in configs")}
            description={t(
              "请检查网络或服务端 API,如反复失败联系管理员。",
              "Check network and the API. If this keeps happening, contact an admin.",
            )}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有签到配置", "No check-in configs yet")}
            description={t(
              "创建第一个签到配置,触达每日活跃玩家。",
              "Create your first check-in to engage daily active players.",
            )}
            action={
              <WriteGate>
                <Button size="sm" onClick={openCreate}>
                  <Plus />
                  {m.checkin_new_config()}
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ConfigTable data={configs ?? []} />
          </div>
        )}
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

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.checkin_new_config()}
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
      <ConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        onSubmit={async (values) => {
          try {
            const row = await mutation.mutateAsync(values)
            toast.success("Check-in created")
            onClose()
            void navigate({
              to: "/check-in/$configId",
              params: { configId: row.id },
            })
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
