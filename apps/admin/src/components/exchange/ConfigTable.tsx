import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link, type AnyRoute} from "@tanstack/react-router";
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
  EXCHANGE_CONFIG_FILTER_DEFS,
  useExchangeConfigs,
} from "#/hooks/use-exchange"
import type { ExchangeConfig } from "#/lib/types/exchange"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<ExchangeConfig>()

function ActionsCell({ config }: { config: ExchangeConfig }) {
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
            <Link to="/o/$orgSlug/p/$projectSlug/exchange/$configId" params={{ orgSlug, projectSlug, configId: config.id }}>
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/exchange/$configId"
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

function useColumns(): ColumnDef<ExchangeConfig, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/exchange/$configId"
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
  ) as ColumnDef<ExchangeConfig, unknown>[]
}

interface Props {
  route: AnyRoute
}

export function ExchangeConfigTable({ route }: Props) {
  const list = useExchangeConfigs(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={EXCHANGE_CONFIG_FILTER_DEFS}
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
