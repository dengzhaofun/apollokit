import { Link } from "@tanstack/react-router"
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
import { useCurrencies } from "#/hooks/use-currency"
import { openEditModal } from "#/lib/modal-search"
import type { CurrencyDefinition } from "#/lib/types/currency"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<CurrencyDefinition>()

function ActionsCell({ def }: { def: CurrencyDefinition }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">{m.common_actions()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            to="/currency"
            search={(prev) => ({ ...prev, ...openEditModal(def.id) })}
          >
            <Pencil className="size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/currency/$currencyId"
            params={{ currencyId: def.id }}
            search={{ delete: true }}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<CurrencyDefinition, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/currency"
            search={(prev) => ({ ...prev, ...openEditModal(info.row.original.id) })}
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
      columnHelper.accessor("activityId", {
        header: () => m.common_link_activity(),
        cell: (info) => {
          const id = info.getValue()
          return id ? (
            <Badge variant="secondary">{id.slice(0, 8)}…</Badge>
          ) : (
            <span className="text-muted-foreground">{m.currency_permanent()}</span>
          )
        },
      }),
      columnHelper.accessor("sortOrder", {
        header: () => m.currency_sort_order(),
        cell: (info) => info.getValue(),
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
        cell: (info) => <ActionsCell def={info.row.original} />,
      }),
    ],
    [],
  ) as ColumnDef<CurrencyDefinition, unknown>[]
}

export function DefinitionTable() {
  const list = useCurrencies()
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
