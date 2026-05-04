import { useTenantParams } from "#/hooks/use-tenant-params"
import { useMemo, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { HeartHandshakeIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
import { useAssistPoolForm } from "#/components/assist-pool/use-config-form"
import { DataTable } from "#/components/data-table/DataTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import {
  ASSIST_POOL_CONFIG_FILTER_DEFS,
  useAssistPoolConfig,
  useAssistPoolConfigs,
  useCreateAssistPoolConfig,
  useUpdateAssistPoolConfig,
} from "#/hooks/use-assist-pool"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
  openEditModal,
} from "#/lib/modal-search"
import type {
  AssistContributionPolicy,
  AssistPoolConfig,
} from "#/lib/types/assist-pool"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "assist-pool-config-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/assist-pool/")({
  component: AssistPoolListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
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

const columnHelper = createColumnHelper<AssistPoolConfig>()

function useColumns(): ColumnDef<AssistPoolConfig, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.assistpool_col_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/assist-pool" params={{ orgSlug, projectSlug }}
            search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(info.row.original.id) })}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.assistpool_col_alias(),
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>
        ),
      }),
      columnHelper.accessor("mode", { header: () => m.assistpool_col_mode() }),
      columnHelper.accessor("targetAmount", {
        header: () => m.assistpool_col_target(),
      }),
      columnHelper.accessor("contributionPolicy", {
        header: () => m.assistpool_col_policy(),
        cell: (info) => (
          <span className="font-mono text-xs">{formatPolicy(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("expiresInSeconds", { header: () => m.assistpool_col_ttl() }),
      columnHelper.accessor("isActive", {
        header: () => m.assistpool_col_active(),
        cell: (info) => (info.getValue() ? m.assistpool_yes() : m.assistpool_no()),
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<AssistPoolConfig, unknown>[]
}

function AssistPoolListPage() {
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

  const list = useAssistPoolConfigs(Route)
  const columns = useColumns()

  return (
    <PageShell>
      <PageHeader
        icon={<HeartHandshakeIcon className="size-5" />}
        title={t("助力池", "Assist pools")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            {m.assistpool_new_config()}
          </Button>
        }
      />

      <PageBody>
        <DataTable
          columns={columns}
          mobileLayout="cards"
          data={list.items}
          getRowId={(row) => row.id}
          filters={ASSIST_POOL_CONFIG_FILTER_DEFS}
          filterValues={list.filters}
          onFilterChange={list.setFilter}
          onResetFilters={list.resetFilters}
          hasActiveFilters={list.hasActiveFilters}
          activeFilterCount={list.activeFilterCount}
          mode={list.mode}
          onModeChange={list.setMode}
          advancedQuery={
            list.advanced as
              | import("#/components/ui/query-builder").RuleGroupType
              | undefined
          }
          onAdvancedQueryChange={list.setAdvanced}
          {...list.tableProps}
        />
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
  const form = useAssistPoolForm({
    onSubmit: async (values) => {
      try {
        await createMutation.mutateAsync(values)
        toast.success(m.assistpool_created())
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : m.assistpool_failed_create(),
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
      isDirty={formState.isDirty && !createMutation.isPending}
      title={m.assistpool_new_config()}
      form={form}
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
        form={form}
      />
    </FormDrawerWithAssist>
  )
}

function EditAssistPoolDrawer({
  id,
  onClose,
}: DrawerShellProps & { id: string }) {
  const { data: cfg, isPending: loading, error } = useAssistPoolConfig(id)

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !cfg) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? "Pool not found"}
      </div>
    )
  }
  return <EditAssistPoolDrawerLoaded cfg={cfg} onClose={onClose} />
}

function EditAssistPoolDrawerLoaded({
  cfg,
  onClose,
}: DrawerShellProps & { cfg: NonNullable<ReturnType<typeof useAssistPoolConfig>["data"]> }) {
  const updateMutation = useUpdateAssistPoolConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useAssistPoolForm({
    defaultValues: {
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
    },
    onSubmit: async (values) => {
      try {
        await updateMutation.mutateAsync({ id: cfg.id, ...values })
        toast.success("Pool updated")
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
      isDirty={formState.isDirty && !updateMutation.isPending}
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
            disabled={!formState.canSubmit || updateMutation.isPending}
          >
            {updateMutation.isPending
              ? m.common_saving()
              : m.common_save_changes()}
          </Button>
        </>
      }
    >
      <AssistPoolConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={updateMutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
