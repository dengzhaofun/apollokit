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
  buildItemDefinitionFilterDefs,
  useAllItemCategories,
  useItemDefinitions,
} from "#/hooks/use-item"
import { openEditModal } from "#/lib/modal-search"
import type { ItemDefinition } from "#/lib/types/item"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<ItemDefinition>()

function stackLabel(def: ItemDefinition): string {
  if (!def.stackable) return m.item_non_stackable()
  if (def.stackLimit == null) return m.common_unlimited()
  return `Stack ≤ ${def.stackLimit}`
}

function ActionsCell({ def }: { def: ItemDefinition }) {
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
              to="/o/$orgSlug/p/$projectSlug/item/definitions" params={{ orgSlug, projectSlug }}
              search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(def.id) })}
            >
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/item/definitions/$definitionId"
              params={{ orgSlug, projectSlug, definitionId: def.id }}
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

function useColumns(): ColumnDef<ItemDefinition, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/item/definitions" params={{ orgSlug, projectSlug }}
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
      columnHelper.accessor("stackable", {
        header: () => m.common_type(),
        cell: (info) => (
          <Badge variant="secondary">{stackLabel(info.row.original)}</Badge>
        ),
      }),
      columnHelper.accessor("holdLimit", {
        header: () => m.item_hold_limit(),
        cell: (info) => {
          const limit = info.getValue()
          return limit != null ? (
            limit
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
        cell: (info) => <ActionsCell def={info.row.original} />,
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<ItemDefinition, unknown>[]
}

interface Props {
  route: AnyRoute
}

export function DefinitionTable({ route }: Props) {
  const { data: categories } = useAllItemCategories()
  const filterDefs = buildItemDefinitionFilterDefs(categories)
  const list = useItemDefinitions(route, filterDefs)
  const columns = useColumns()

  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={filterDefs}
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
