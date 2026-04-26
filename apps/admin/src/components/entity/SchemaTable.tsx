import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { useEntitySchemas } from "#/hooks/use-entity"
import type { EntitySchema } from "#/lib/types/entity"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<EntitySchema>()

function useColumns(): ColumnDef<EntitySchema, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/entity/schemas/$schemaId"
            params={{ schemaId: info.row.original.id }}
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
      columnHelper.accessor("statDefinitions", {
        header: () => m.entity_stat_definitions(),
        cell: (info) => <Badge variant="secondary">{info.getValue().length}</Badge>,
      }),
      columnHelper.accessor("slotDefinitions", {
        header: () => m.entity_slot_definitions(),
        cell: (info) => <Badge variant="secondary">{info.getValue().length}</Badge>,
      }),
      columnHelper.accessor("levelConfig", {
        header: () => m.entity_level_config(),
        cell: (info) => {
          const cfg = info.getValue()
          return (
            <Badge variant={cfg.enabled ? "default" : "outline"}>
              {cfg.enabled ? `Lv.${cfg.maxLevel}` : m.entity_disabled()}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("rankConfig", {
        header: () => m.entity_rank_config(),
        cell: (info) => {
          const cfg = info.getValue()
          return (
            <Badge variant={cfg.enabled ? "default" : "outline"}>
              {cfg.enabled ? `${cfg.ranks.length}` : m.entity_disabled()}
            </Badge>
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
  ) as ColumnDef<EntitySchema, unknown>[]
}

export function SchemaTable() {
  const list = useEntitySchemas()
  const columns = useColumns()
  return (
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
  )
}
