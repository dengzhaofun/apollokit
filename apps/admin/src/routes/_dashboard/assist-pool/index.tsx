import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { HeartHandshakeIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useAssistPoolConfig,
  useAssistPoolConfigs,
  useCreateAssistPoolConfig,
  useUpdateAssistPoolConfig,
} from "#/hooks/use-assist-pool"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
  openEditModal,
} from "#/lib/modal-search"
import type { AssistContributionPolicy } from "#/lib/types/assist-pool"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "assist-pool-config-form"

export const Route = createFileRoute("/_dashboard/assist-pool/")({
  component: AssistPoolListPage,
  validateSearch: modalSearchSchema,
})

function formatPolicy(p: AssistContributionPolicy): string {
  switch (p.kind) {
    case "fixed":
      return `fixed(${p.amount})`
    case "uniform":
      return `uniform(${p.min}..${p.max})`
    case "decaying":
      return `decaying(base=${p.base}, tail=${(p.tailRatio * 100).toFixed(0)}%→${p.tailFloor})`
  }
}

function AssistPoolListPage() {
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

  const { data: configs, isPending, error, refetch } = useAssistPoolConfigs()
  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<HeartHandshakeIcon className="size-5" />}
        title={t("助力池", "Assist pools")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个助力池`, `${total} pools total`)
        }
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            {m.assistpool_new_config()}
          </Button>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("助力池加载失败", "Failed to load assist pools")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有助力池", "No assist pools yet")}
            description={t(
              "创建第一个助力池,聚合好友 / 公会贡献达成共同目标。",
              "Create your first pool to aggregate friend or guild contributions toward a shared goal.",
            )}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.assistpool_new_config()}
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.assistpool_col_name()}</TableHead>
                  <TableHead>{m.assistpool_col_alias()}</TableHead>
                  <TableHead>{m.assistpool_col_mode()}</TableHead>
                  <TableHead>{m.assistpool_col_target()}</TableHead>
                  <TableHead>{m.assistpool_col_policy()}</TableHead>
                  <TableHead>{m.assistpool_col_ttl()}</TableHead>
                  <TableHead>{m.assistpool_col_active()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs!.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/assist-pool"
                        search={(prev) => ({ ...prev, ...openEditModal(c.id) })}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.alias ?? "—"}
                    </TableCell>
                    <TableCell>{c.mode}</TableCell>
                    <TableCell>{c.targetAmount}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatPolicy(c.contributionPolicy)}
                    </TableCell>
                    <TableCell>{c.expiresInSeconds}</TableCell>
                    <TableCell>
                      {c.isActive ? m.assistpool_yes() : m.assistpool_no()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      {modal === "create" ? (
        <CreateAssistPoolDrawer onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditAssistPoolDrawer id={editingId} onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

interface DrawerShellProps {
  onClose: () => void
}

function CreateAssistPoolDrawer({ onClose }: DrawerShellProps) {
  const createMutation = useCreateAssistPoolConfig()
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
      isDirty={formState.isDirty && !createMutation.isPending}
      title={m.assistpool_new_config()}
      size="lg"
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
            {createMutation.isPending ? m.common_saving() : m.assistpool_create()}
          </Button>
        </>
      }
    >
      <AssistPoolConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={createMutation.isPending}
        onSubmit={async (values) => {
          try {
            await createMutation.mutateAsync(values)
            toast.success(m.assistpool_created())
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.body.error
                : m.assistpool_failed_create(),
            )
          }
        }}
      />
    </FormDrawer>
  )
}

function EditAssistPoolDrawer({
  id,
  onClose,
}: DrawerShellProps & { id: string }) {
  const { data: cfg, isPending: loading, error } = useAssistPoolConfig(id)
  const updateMutation = useUpdateAssistPoolConfig()
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
      isDirty={formState.isDirty && !updateMutation.isPending}
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
            disabled={!cfg || !formState.canSubmit || updateMutation.isPending}
          >
            {updateMutation.isPending
              ? m.common_saving()
              : m.common_save_changes()}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error || !cfg ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Pool not found"}
        </div>
      ) : (
        <AssistPoolConfigForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          defaultValues={{
            name: cfg.name,
            alias: cfg.alias,
            description: cfg.description,
            mode: cfg.mode,
            targetAmount: cfg.targetAmount,
            contributionPolicy: cfg.contributionPolicy,
            perAssisterLimit: cfg.perAssisterLimit,
            initiatorCanAssist: cfg.initiatorCanAssist,
            expiresInSeconds: cfg.expiresInSeconds,
            isActive: cfg.isActive,
            activityId: cfg.activityId,
          }}
          isPending={updateMutation.isPending}
          onSubmit={async (values) => {
            try {
              await updateMutation.mutateAsync({ id: cfg.id, ...values })
              toast.success("Pool updated")
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
