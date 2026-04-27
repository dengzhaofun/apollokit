import { useMemo, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { DataTable } from "#/components/data-table/DataTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { TeamConfigForm } from "#/components/team/TeamConfigForm"
import { useTeamConfigForm } from "#/components/team/use-config-form"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import {
  useCreateTeamConfig,
  useTeamConfig,
  useTeamConfigs,
  useUpdateTeamConfig,
} from "#/hooks/use-team"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
  openEditModal,
} from "#/lib/modal-search"
import type { TeamConfig } from "#/lib/types/team"

const FORM_ID = "team-config-form"

export const Route = createFileRoute("/_dashboard/team/")({
  component: TeamPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

const columnHelper = createColumnHelper<TeamConfig>()

function useColumns(): ColumnDef<TeamConfig, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/team"
            search={(prev) => ({ ...prev, ...openEditModal(info.row.original.id) })}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("maxMembers", { header: () => m.team_max_members() }),
      columnHelper.accessor("autoDissolveOnLeaderLeave", {
        header: () => m.team_auto_dissolve(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Yes" : "No"}
          </Badge>
        ),
      }),
      columnHelper.accessor("allowQuickMatch", {
        header: () => m.team_quick_match(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Yes" : "No"}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
      }),
    ],
    [],
  ) as ColumnDef<TeamConfig, unknown>[]
}

function TeamPage() {
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

  const list = useTeamConfigs(Route)
  const columns = useColumns()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {m.team_new_config()}
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
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
      </main>

      {modal === "create" ? (
        <CreateTeamConfigDialog onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditTeamConfigDialog id={editingId} onClose={closeModal} />
      ) : null}
    </>
  )
}

interface DialogShellProps {
  onClose: () => void
}

function CreateTeamConfigDialog({ onClose }: DialogShellProps) {
  const createMutation = useCreateTeamConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useTeamConfigForm({
    onSubmit: async (values) => {
      try {
        await createMutation.mutateAsync(values)
        toast.success(m.team_config_created())
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to create team config",
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
      title={m.team_new_config()}
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
            {createMutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <TeamConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={createMutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}

function EditTeamConfigDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: cfg, isPending: loading, error } = useTeamConfig(id)
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
        {error?.message ?? "Team config not found"}
      </div>
    )
  }
  return <EditTeamConfigDialogLoaded cfg={cfg} onClose={onClose} />
}

function EditTeamConfigDialogLoaded({
  cfg,
  onClose,
}: DialogShellProps & {
  cfg: NonNullable<ReturnType<typeof useTeamConfig>["data"]>
}) {
  const updateMutation = useUpdateTeamConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useTeamConfigForm({
    defaultValues: {
      name: cfg.name,
      alias: cfg.alias,
      maxMembers: cfg.maxMembers,
      autoDissolveOnLeaderLeave: cfg.autoDissolveOnLeaderLeave,
      allowQuickMatch: cfg.allowQuickMatch,
    },
    onSubmit: async (values) => {
      try {
        await updateMutation.mutateAsync({ id: cfg.id, input: values })
        toast.success("Team config updated")
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
      <TeamConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={updateMutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
