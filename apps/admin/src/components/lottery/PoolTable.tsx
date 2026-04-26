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
import { useLotteryPools } from "#/hooks/use-lottery"
import type { LotteryPool } from "#/lib/types/lottery"

const columnHelper = createColumnHelper<LotteryPool>()

function ActionsCell({ pool }: { pool: LotteryPool }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/lottery/$poolId" params={{ poolId: pool.id }}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/lottery/$poolId"
            params={{ poolId: pool.id }}
            search={{ delete: true }}
          >
            <Trash2 className="size-4" />
            Delete
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<LotteryPool, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => (
          <Link
            to="/lottery/$poolId"
            params={{ poolId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: "Alias",
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("costPerPull", {
        header: "Cost/Pull",
        cell: (info) => {
          const cost = info.getValue()
          return cost.length === 0 ? (
            <span className="text-muted-foreground">Free</span>
          ) : (
            <span className="text-xs">{cost.length} item(s)</span>
          )
        },
      }),
      columnHelper.accessor("globalPullCount", {
        header: "Pulls",
        cell: (info) => {
          const pool = info.row.original
          return pool.globalPullLimit
            ? `${info.getValue()} / ${pool.globalPullLimit}`
            : info.getValue()
        },
      }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? "Active" : "Inactive"}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell pool={info.row.original} />,
      }),
    ],
    [],
  ) as ColumnDef<LotteryPool, unknown>[]
}

interface Props {
  activityId?: string
  includeActivity?: boolean
}

export function LotteryPoolTable(props: Props = {}) {
  const list = useLotteryPools(props)
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
