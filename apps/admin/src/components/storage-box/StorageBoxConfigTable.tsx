import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link, type AnyRoute} from "@tanstack/react-router";
import { useMoveStorageBoxConfig } from "#/hooks/use-move"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import {
  STORAGE_BOX_CONFIG_FILTER_DEFS,
  useStorageBoxConfigs,
} from "#/hooks/use-storage-box"
import type { StorageBoxConfig } from "#/lib/types/storage-box"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<StorageBoxConfig>()

function ActionsCell({ config }: { config: StorageBoxConfig }) {
  const { orgSlug, projectSlug } = useTenantParams()
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
        <DropdownMenuItem
          render={
            <Link to="/o/$orgSlug/p/$projectSlug/storage-box/configs/$configId" params={{ orgSlug, projectSlug, configId: config.id }}>
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/storage-box/configs/$configId"
              params={{ orgSlug, projectSlug, configId: config.id }}
              search={{ delete: true }}
            >
              <Trash2 className="size-4" />
              {m.common_delete()}
            </Link>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<StorageBoxConfig, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/storage-box/configs/$configId"
            params={{ orgSlug, projectSlug, configId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <span className="text-muted-foreground">{m.common_dash()}</span>
          )
        },
      }),
      columnHelper.accessor("type", {
        header: () => m.common_type(),
        cell: (info) => {
          const t = info.getValue()
          return t === "fixed" ? (
            <Badge variant="default">{m.storage_box_type_fixed()}</Badge>
          ) : (
            <Badge variant="secondary">{m.storage_box_type_demand()}</Badge>
          )
        },
      }),
      columnHelper.accessor("lockupDays", {
        header: () => m.storage_box_field_lock_days(),
        cell: (info) =>
          info.getValue() != null ? (
            info.getValue()
          ) : (
            <span className="text-muted-foreground">{m.common_dash()}</span>
          ),
      }),
      columnHelper.accessor("interestRateBps", {
        header: () => m.storage_box_field_interest_rate(),
        cell: (info) => {
          const row = info.row.original
          const pct = row.interestRateBps / 100
          return (
            <span className="text-sm">
              {pct.toFixed(2)}% / {row.interestPeriodDays}d
            </span>
          )
        },
      }),
      columnHelper.accessor("acceptedCurrencyIds", {
        header: () => m.storage_box_deposit_col_box(),
        cell: (info) => <Badge variant="outline">{info.getValue().length}</Badge>,
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell config={info.row.original} />,
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<StorageBoxConfig, unknown>[]
}

interface Props {
  route: AnyRoute
}

export function StorageBoxConfigTable({ route }: Props) {
  const list = useStorageBoxConfigs(route)
  const columns = useColumns()
  const moveMutation = useMoveStorageBoxConfig()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={STORAGE_BOX_CONFIG_FILTER_DEFS}
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
      sortable={{ onMove: (id, body) => moveMutation.mutate({ id, body }), disabled: moveMutation.isPending }}
      {...list.tableProps}
    />
  )
}
