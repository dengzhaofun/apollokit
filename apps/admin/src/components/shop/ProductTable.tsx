import { Link } from "@tanstack/react-router"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useDeleteShopProduct } from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import type { ShopProduct } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { TagBadge } from "./TagBadge"

const columnHelper = createColumnHelper<ShopProduct>()

const columns = [
  columnHelper.accessor("name", {
    header: () => m.common_name(),
    cell: (info) => (
      <Link
        to="/shop/$productId"
        params={{ productId: info.row.original.id }}
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
  columnHelper.accessor("productType", {
    header: () => m.shop_product_type(),
    cell: (info) =>
      info.getValue() === "regular"
        ? m.shop_type_regular()
        : m.shop_type_growth_pack(),
  }),
  columnHelper.accessor("timeWindowType", {
    header: () => m.shop_time_window_type(),
    cell: (info) => {
      const v = info.getValue()
      switch (v) {
        case "absolute":
          return m.shop_time_window_absolute()
        case "relative":
          return m.shop_time_window_relative()
        case "cyclic":
          return m.shop_time_window_cyclic()
        default:
          return m.shop_time_window_none()
      }
    },
  }),
  columnHelper.accessor("tags", {
    header: () => m.shop_tags(),
    cell: (info) => {
      const tags = info.getValue()
      if (!tags || tags.length === 0)
        return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
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
    cell: (info) => <ActionsCell product={info.row.original} />,
  }),
]

function ActionsCell({ product }: { product: ShopProduct }) {
  const deleteMutation = useDeleteShopProduct()

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
            to="/shop/$productId"
            params={{ productId: product.id }}
          >
            <Pencil className="size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={async (e) => {
            e.preventDefault()
            try {
              await deleteMutation.mutateAsync(product.id)
              toast.success(m.shop_product_deleted())
            } catch (err) {
              toast.error(
                err instanceof ApiError
                  ? err.body.error
                  : m.shop_failed_delete_product(),
              )
            }
          }}
        >
          <Trash2 className="size-4" />
          {m.common_delete()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ProductTableProps {
  data: ShopProduct[]
}

export function ProductTable({ data }: ProductTableProps) {
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
              {m.shop_no_products()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
