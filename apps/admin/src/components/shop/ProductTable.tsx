import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

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
  SHOP_PRODUCT_FILTER_DEFS,
  useDeleteShopProduct,
  useShopProducts,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import type {
  ShopListProductsQuery,
  ShopProduct,
  ShopProductType,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { TagBadge } from "./TagBadge"

const columnHelper = createColumnHelper<ShopProduct>()

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
          <Link to="/shop/$productId" params={{ productId: product.id }}>
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
                err instanceof ApiError ? err.body.error : m.shop_failed_delete_product(),
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

function useColumns(): ColumnDef<ShopProduct, unknown>[] {
  return useMemo(
    () => [
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
          info.getValue() === "regular" ? m.shop_type_regular() : m.shop_type_growth_pack(),
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
    ],
    [],
  ) as ColumnDef<ShopProduct, unknown>[]
}

export interface ProductTableProps {
  productType?: ShopProductType
  categoryId?: string
  tagId?: string
  /** Activity-scope passthrough — see ActivityScopeFilter. */
  activityFilter?: Pick<ShopListProductsQuery, "activityId" | "includeActivity">
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function ProductTable({
  productType,
  categoryId,
  tagId,
  activityFilter,
  route,
}: ProductTableProps) {
  const list = useShopProducts(route, {
    productType,
    categoryId,
    tagId,
    ...activityFilter,
  })
  const columns = useColumns()

  return (
    <DataTable
      columns={columns}
      data={list.items}
      getRowId={(row) => row.id}
      filters={SHOP_PRODUCT_FILTER_DEFS}
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
