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
import { useItemCategories } from "#/hooks/use-item"
import { useMoveItemCategory } from "#/hooks/use-move"
import { openEditModal } from "#/lib/modal-search"
import type { ItemCategory } from "#/lib/types/item"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<ItemCategory>()

function ActionsCell({ category }: { category: ItemCategory }) {
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
              to="/o/$orgSlug/p/$projectSlug/item/categories" params={{ orgSlug, projectSlug }}
              search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(category.id) })}
            >
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/item/categories/$categoryId"
              params={{ orgSlug, projectSlug, categoryId: category.id }}
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

function useColumns(): ColumnDef<ItemCategory, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/item/categories" params={{ orgSlug, projectSlug }}
            search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(info.row.original.id) })}
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
        cell: (info) => <ActionsCell category={info.row.original} />,
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<ItemCategory, unknown>[]
}

interface CategoryTableProps {
  route: AnyRoute
}

export function CategoryTable({ route }: CategoryTableProps) {
  const list = useItemCategories(route)
  const columns = useColumns()

  const moveMutation = useMoveItemCategory()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      sortable={{ onMove: (id, body) => moveMutation.mutate({ id, body }), disabled: moveMutation.isPending }}
      {...list.tableProps}
    />
  )
}
