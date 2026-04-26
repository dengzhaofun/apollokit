import { useMemo, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { HeartHandshakeIcon, Plus } from "lucide-react"
import { toast } from "sonner"

import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
import { DataTable } from "#/components/data-table/DataTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
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
import type {
  AssistContributionPolicy,
  AssistPoolConfig,
} from "#/lib/types/assist-pool"
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

const columnHelper = createColumnHelper<AssistPoolConfig>()

function useColumns(): ColumnDef<AssistPoolConfig, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.assistpool_col_name(),
        cell: (info) => (
          <Link
            to="/assist-pool"
            search={(prev) => ({ ...prev, ...openEditModal(info.row.original.id) })}
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
    [],
  ) as ColumnDef<AssistPoolConfig, unknown>[]
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

  const list = useAssistPoolConfigs()
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
          data={list.items}
          isLoading={list.isLoading}
          getRowId={(row) => row.id}
          pageIndex={list.pageIndex}
          canPrev={list.canPrev}
          canNext={list.canNext}
          onNextPage={list.nextPage}
          onPrevPage={list.prevPage}
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          searchValue={list.searchInput}
          onSearchChange={list.setSearchInput}
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
