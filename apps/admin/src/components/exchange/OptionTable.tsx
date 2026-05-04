import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link, type AnyRoute} from "@tanstack/react-router";
import { useMoveExchangeOption } from "#/hooks/use-move"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
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
  EXCHANGE_OPTION_FILTER_DEFS,
  useExchangeOptions,
} from "#/hooks/use-exchange"
import type { ExchangeOption } from "#/lib/types/exchange"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<ExchangeOption>()

function ActionsCell({ option }: { option: ExchangeOption }) {
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
            <Link
              to="/o/$orgSlug/p/$projectSlug/exchange/$configId/options/$optionId"
              params={{ orgSlug, projectSlug, configId: option.configId,
                optionId: option.id, }}
            >
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/exchange/$configId/options/$optionId"
              params={{ orgSlug, projectSlug, configId: option.configId,
                optionId: option.id, }}
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

function useColumns(): ColumnDef<ExchangeOption, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/exchange/$configId/options/$optionId"
            params={{ orgSlug, projectSlug, configId: info.row.original.configId,
              optionId: info.row.original.id, }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("costItems", {
        header: () => m.exchange_costs(),
        cell: (info) => (
          <span className="text-xs">
            {info.getValue().length} {m.exchange_items_suffix()}
          </span>
        ),
      }),
      columnHelper.accessor("rewardItems", {
        header: () => m.exchange_rewards(),
        cell: (info) => (
          <span className="text-xs">
            {info.getValue().length} {m.exchange_items_suffix()}
          </span>
        ),
      }),
      columnHelper.accessor("globalCount", {
        header: () => m.exchange_usage(),
        cell: (info) => {
          const option = info.row.original
          if (option.globalLimit != null) {
            return `${info.getValue()} / ${option.globalLimit}`
          }
          return info.getValue()
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
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell option={info.row.original} />,
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<ExchangeOption, unknown>[]
}

interface Props {
  configKey: string
  route: AnyRoute
}

export function OptionTable({ configKey, route }: Props) {
  const list = useExchangeOptions(configKey, route)
  const columns = useColumns()
  const moveMutation = useMoveExchangeOption()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={EXCHANGE_OPTION_FILTER_DEFS}
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
