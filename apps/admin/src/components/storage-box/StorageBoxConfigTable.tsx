import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import type { StorageBoxConfig } from "#/lib/types/storage-box"

const columnHelper = createColumnHelper<StorageBoxConfig>()

const columns = [
  columnHelper.accessor("name", {
    header: () => "名称",
    cell: (info) => (
      <Link
        to="/storage-box/configs/$configId"
        params={{ configId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("alias", {
    header: () => "别名",
    cell: (info) => {
      const alias = info.getValue()
      return alias ? (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  }),
  columnHelper.accessor("type", {
    header: () => "类型",
    cell: (info) => {
      const t = info.getValue()
      return t === "fixed" ? (
        <Badge variant="default">定期</Badge>
      ) : (
        <Badge variant="secondary">活期</Badge>
      )
    },
  }),
  columnHelper.accessor("lockupDays", {
    header: () => "锁仓天数",
    cell: (info) =>
      info.getValue() != null ? (
        info.getValue()
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  columnHelper.accessor("interestRateBps", {
    header: () => "利率",
    cell: (info) => {
      const row = info.row.original
      const pct = row.interestRateBps / 100
      return (
        <span className="text-sm">
          {pct.toFixed(2)}% / {row.interestPeriodDays}d
        </span>
      )
    },
  }),
  columnHelper.accessor("acceptedCurrencyIds", {
    header: () => "货币",
    cell: (info) => (
      <Badge variant="outline">{info.getValue().length}</Badge>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: () => "状态",
    cell: (info) => (
      <Badge variant={info.getValue() ? "default" : "outline"}>
        {info.getValue() ? "激活" : "禁用"}
      </Badge>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: () => "创建时间",
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => <ActionsCell config={info.row.original} />,
  }),
]

function ActionsCell({ config }: { config: StorageBoxConfig }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">操作</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            to="/storage-box/configs/$configId"
            params={{ configId: config.id }}
          >
            <Pencil className="size-4" />
            编辑
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/storage-box/configs/$configId"
            params={{ configId: config.id }}
            search={{ delete: true }}
          >
            <Trash2 className="size-4" />
            删除
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface Props {
  data: StorageBoxConfig[]
}

export function StorageBoxConfigTable({ data }: Props) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              还没有存储箱配置。
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
