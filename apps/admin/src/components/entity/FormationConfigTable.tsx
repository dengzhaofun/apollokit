import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import {
  ENTITY_FORMATION_CONFIG_FILTER_DEFS,
  useEntityFormationConfigs,
} from "#/hooks/use-entity"
import type { EntityFormationConfig } from "#/lib/types/entity"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<EntityFormationConfig>()

function useColumns(): ColumnDef<EntityFormationConfig, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
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
      columnHelper.accessor("maxFormations", { header: () => m.entity_max_formations() }),
      columnHelper.accessor("maxSlots", { header: () => m.entity_max_slots() }),
      columnHelper.accessor("allowDuplicateBlueprints", {
        header: () => m.entity_allow_duplicate_blueprints(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_yes() : m.common_no()}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: () => m.common_updated(),
        cell: (info) => (
          <span className="text-muted-foreground text-sm">
            {format(new Date(info.getValue()), "yyyy-MM-dd")}
          </span>
        ),
      }),
    ],
    [],
  ) as ColumnDef<EntityFormationConfig, unknown>[]
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function FormationConfigTable({ route }: Props) {
  const list = useEntityFormationConfigs(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={ENTITY_FORMATION_CONFIG_FILTER_DEFS}
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
