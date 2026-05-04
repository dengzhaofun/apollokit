import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link, type AnyRoute} from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { DataTable } from "#/components/data-table/DataTable"
import { ExperimentStatusBadge } from "#/components/experiment/StatusBadge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import {
  EXPERIMENT_FILTER_DEFS,
  useDeleteExperiment,
  useExperiments,
} from "#/hooks/use-experiment"
import { confirm } from "#/components/patterns"
import { ApiError } from "#/lib/api-client"
import type { Experiment, ExperimentStatus } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<Experiment>()

function ActionsCell({ experiment }: { experiment: Experiment }) {
  const del = useDeleteExperiment()
  const isDeletable =
    experiment.status === "draft" || experiment.status === "archived"
  const { orgSlug, projectSlug } = useTenantParams()

  async function copyKey(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(experiment.key)
      toast.success(m.experiment_key_copied())
    } catch {
      toast.error(m.experiment_failed_generic())
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: m.experiment_delete_confirm_title({ name: experiment.name }),
      description: m.experiment_delete_confirm_body(),
      confirmLabel: m.common_delete(),
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(experiment.id)
      toast.success(
        m.experiment_archived({ name: experiment.name }),
      )
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.message : m.experiment_failed_generic(),
      )
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{m.common_actions()}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copyKey}>
          <Copy className="size-4" />
          {m.experiment_action_copy_key()}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/experiment/$experimentKey"
              params={{ orgSlug, projectSlug, experimentKey: experiment.key }}
            >
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        {isDeletable && (
          <DropdownMenuItem onClick={handleDelete} disabled={del.isPending}>
            <Trash2 className="size-4" />
            {m.common_delete()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<Experiment, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/experiment/$experimentKey"
            params={{ orgSlug, projectSlug, experimentKey: info.row.original.key }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
        meta: { primary: true },
      }),
      columnHelper.accessor("key", {
        header: () => m.experiment_field_key(),
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {info.getValue()}
          </code>
        ),
      }),
      columnHelper.accessor("status", {
        header: () => m.experiment_field_status(),
        cell: (info) => (
          <ExperimentStatusBadge status={info.getValue() as ExperimentStatus} />
        ),
      }),
      columnHelper.accessor((row) => row.variantsCount ?? 0, {
        id: "variantsCount",
        header: () => m.experiment_field_variants_count(),
        cell: (info) => (
          <span className="tabular-nums text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.assignedUsers ?? 0, {
        id: "assignedUsers",
        header: () => m.experiment_field_assigned_users(),
        cell: (info) => (
          <span className="tabular-nums text-muted-foreground">
            {info.getValue().toLocaleString()}
          </span>
        ),
      }),
      columnHelper.accessor("startedAt", {
        header: () => m.experiment_field_started_at(),
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <span className="text-sm text-muted-foreground">
              {format(new Date(v), "yyyy-MM-dd")}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
        meta: { hideOnMobile: true },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell experiment={info.row.original} />,
        meta: { isActions: true },
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<Experiment, unknown>[]
}

interface Props {
  route: AnyRoute
  status?: ExperimentStatus | ""
}

export function ExperimentTable({ route, status }: Props) {
  const list = useExperiments(route, { status })
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={EXPERIMENT_FILTER_DEFS}
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
  )
}
