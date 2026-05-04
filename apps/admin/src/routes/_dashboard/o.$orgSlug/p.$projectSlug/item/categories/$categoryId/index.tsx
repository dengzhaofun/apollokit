import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useNavigate, Link } from "#/components/router-helpers"
import { format } from "date-fns"
import { Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { CategoryForm } from "#/components/item/CategoryForm"
import { DeleteItemDialog } from "#/components/item/DeleteItemDialog"
import {
  useItemCategory,
  useUpdateItemCategory,
  useDeleteItemCategory,
} from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/item/categories/$categoryId/",
)({
  component: CategoryDetailPage,
})

function CategoryDetailPage() {
  const { categoryId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: category, isPending, error } = useItemCategory(categoryId)
  const updateMutation = useUpdateItemCategory()
  const deleteMutation = useDeleteItemCategory()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !category) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Category not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button
              render={
                <Link to="/item/categories">
                  <ArrowLeft className="size-4" />
                  {m.common_back()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? m.common_cancel() : m.common_edit()}
              </Button>
              <DeleteItemDialog
                name={category.name}
                description={m.item_delete_category_desc()}
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(category.id)
                    toast.success(m.item_category_deleted())
                    navigate({ to: "/o/$orgSlug/p/$projectSlug/item/categories" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.item_failed_delete_category(),
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <CategoryForm
                defaultValues={{
                  name: category.name,
                  alias: category.alias,
                  icon: category.icon,
                  isActive: category.isActive,
                }}
                submitLabel={m.common_save_changes()}
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: category.id,
                      ...values,
                    })
                    toast.success(m.item_category_updated())
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to update category",
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={category.name} />
                <DetailItem
                  label={m.common_alias()}
                  value={
                    category.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {category.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label={m.common_icon()}
                  value={category.icon ?? "—"}
                />
                <DetailItem
                  label={m.common_sort_order()}
                  value={category.sortOrder}
                />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge variant={category.isActive ? "default" : "outline"}>
                      {category.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(category.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label="Updated"
                  value={format(new Date(category.updatedAt), "yyyy-MM-dd HH:mm")}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}
