import { useTenantParams } from "#/hooks/use-tenant-params"
import { Link, type AnyRoute} from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { CHARACTER_FILTER_DEFS, useCharacters } from "#/hooks/use-character"
import { resolveAssetUrl } from "#/lib/api-client"
import { openEditModal } from "#/lib/modal-search"
import type { Character } from "#/lib/types/character"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<Character>()

function useColumns(): ColumnDef<Character, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("avatarUrl", {

      header: () => m.character_col_avatar(),
        cell: (info) => {
          const url = info.getValue()
          return url ? (
            <img
              src={resolveAssetUrl(url)}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <div className="size-8 rounded-full bg-muted" />
          )
        },
      }),
      columnHelper.accessor("name", {
        header: () => m.character_col_name(),
        meta: { primary: true },
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/character" params={{ orgSlug, projectSlug }}
            search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(info.row.original.id) })}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.character_col_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("defaultSide", {
        header: () => m.character_col_default_side(),
        cell: (info) =>
          info.getValue() === "left"
            ? m.character_side_left()
            : info.getValue() === "right"
              ? m.character_side_right()
              : <span className="text-muted-foreground">—</span>,
      }),
      columnHelper.accessor("isActive", {
        header: () => m.character_col_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: () => m.common_updated(),
        cell: (info) => (
          <span className="text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<Character, unknown>[]
}

interface Props {
  route: AnyRoute
}

export function CharacterTable({ route }: Props) {
  const list = useCharacters(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={CHARACTER_FILTER_DEFS}
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
