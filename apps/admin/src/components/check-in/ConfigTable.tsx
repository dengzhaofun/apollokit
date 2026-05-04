import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link, type AnyRoute} from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Gift, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
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
  CHECK_IN_CONFIG_FILTER_DEFS,
  useCheckInConfigs,
} from "#/hooks/use-check-in"
import type { CheckInConfig } from "#/lib/types/check-in"
import * as m from "#/paraglide/messages.js"

function getResetModeLabels(): Record<string, string> {
  return {
    none: m.checkin_reset_none(),
    week: m.checkin_reset_weekly(),
    month: m.checkin_reset_monthly(),
  }
}

const columnHelper = createColumnHelper<CheckInConfig>()

function ActionsCell({ config }: { config: CheckInConfig }) {
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
            <Link to="/o/$orgSlug/p/$projectSlug/check-in/$configId" params={{ orgSlug, projectSlug, configId: config.id }}>
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/check-in/$configId"
              params={{ orgSlug, projectSlug, configId: config.id }}
              hash="rewards"
            >
              <Gift className="size-4" />
              {m.reward_table_link_configure()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/check-in/$configId"
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

function useColumns(): ColumnDef<CheckInConfig, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/check-in/$configId"
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
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("resetMode", {
        header: () => m.checkin_reset_mode(),
        cell: (info) => (
          <Badge variant="secondary">
            {getResetModeLabels()[info.getValue()] ?? info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("target", {
        header: () => m.checkin_target(),
        cell: (info) => {
          const target = info.getValue()
          return target != null ? (
            <span>
              {target} {m.checkin_days()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
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
  ) as ColumnDef<CheckInConfig, unknown>[]
}

interface Props {
  /** Pass an activity scope filter — see useCheckInConfigs. */
  activityId?: string
  includeActivity?: boolean
  route: AnyRoute
}

export function ConfigTable({ route, ...rest }: Props) {
  const list = useCheckInConfigs(route, rest)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={CHECK_IN_CONFIG_FILTER_DEFS}
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
