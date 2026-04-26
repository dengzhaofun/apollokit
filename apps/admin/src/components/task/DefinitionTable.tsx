import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil } from "lucide-react"
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
import { useTaskDefinitions } from "#/hooks/use-task"
import type { TaskDefinition } from "#/lib/types/task"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<TaskDefinition>()

function ActionsCell({ def }: { def: TaskDefinition }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/task/$taskId" params={{ taskId: def.id }}>
            <Pencil className="mr-2 size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<TaskDefinition, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/task/$taskId"
            params={{ taskId: info.row.original.id }}
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
      columnHelper.accessor("period", {
        header: () => "Period",
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
      }),
      columnHelper.accessor("countingMethod", {
        header: () => "Method",
        cell: (info) => {
          const v = info.getValue()
          return v === "event_count"
            ? "Count"
            : v === "event_value"
              ? "Value"
              : "Children"
        },
      }),
      columnHelper.accessor("targetValue", {
        header: () => "Target",
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
  ) as ColumnDef<TaskDefinition, unknown>[]
}

interface Props {
  categoryId?: string
  activityId?: string
  includeActivity?: boolean
}

export function DefinitionTable(props: Props = {}) {
  const list = useTaskDefinitions(props)
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
