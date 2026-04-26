import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { useCharacters } from "#/hooks/use-character"
import { resolveAssetUrl } from "#/lib/api-client"
import { openEditModal } from "#/lib/modal-search"
import type { Character } from "#/lib/types/character"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<Character>()

function useColumns(): ColumnDef<Character, unknown>[] {
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
        cell: (info) => (
          <Link
            to="/character"
            search={(prev) => ({ ...prev, ...openEditModal(info.row.original.id) })}
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
    [],
  ) as ColumnDef<Character, unknown>[]
}

export function CharacterTable() {
  const list = useCharacters()
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
