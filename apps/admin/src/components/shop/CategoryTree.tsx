import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FolderOpen, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { useDeleteShopCategory } from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import type { ShopCategoryNode } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { ShopDeleteDialog } from "./DeleteDialog"

interface CategoryTreeProps {
  nodes: ShopCategoryNode[]
}

export function CategoryTree({ nodes }: CategoryTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.shop_no_categories()}
      </div>
    )
  }
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <CategoryNode key={node.id} node={node} depth={0} />
      ))}
    </ul>
  )
}

function CategoryNode({
  node,
  depth,
}: {
  node: ShopCategoryNode
  depth: number
}) {
  const deleteMutation = useDeleteShopCategory()
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.children.length > 0 ? (
          <ChevronRight className="size-4 text-muted-foreground" />
        ) : (
          <FolderOpen className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium">{node.name}</span>
        {node.alias ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {node.alias}
          </code>
        ) : null}
        {!node.isActive ? (
          <Badge variant="outline">{m.common_inactive()}</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            render={
              <Link
                to="/o/$orgSlug/p/$projectSlug/shop/categories/$categoryId"
                params={{ orgSlug, projectSlug, categoryId: node.id }}
              >
                <Pencil className="size-3.5" />
              </Link>
            }
            variant="ghost"
            size="icon"
            className="size-7"
          />
          <ShopDeleteDialog
            title={m.shop_delete_category_title()}
            description={m.shop_delete_category_desc()}
            isPending={deleteMutation.isPending}
            onConfirm={async () => {
              try {
                await deleteMutation.mutateAsync(node.id)
                toast.success(m.shop_category_deleted())
              } catch (err) {
                toast.error(
                  err instanceof ApiError
                    ? err.body.error
                    : m.shop_failed_delete_category(),
                )
              }
            }}
          />
        </div>
      </div>
      {node.children.length > 0 ? (
        <ul className="space-y-1">
          {node.children.map((child) => (
            <CategoryNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
