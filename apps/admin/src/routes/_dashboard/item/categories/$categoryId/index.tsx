import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
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
  "/_dashboard/item/categories/$categoryId/",
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
        <Header title="Loading..." />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </>
    )
  }

  if (error || !category) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Category not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={category.name} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/item">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? "Cancel" : "Edit"}
              </Button>
              <DeleteItemDialog
                name={category.name}
                description="This will permanently delete this category. Item definitions using this category will become uncategorized."
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(category.id)
                    toast.success("Category deleted")
                    navigate({ to: "/item" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to delete category",
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
                  sortOrder: category.sortOrder,
                  isActive: category.isActive,
                }}
                submitLabel="Save Changes"
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: category.id,
                      ...values,
                    })
                    toast.success("Category updated")
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
                <DetailItem label="Name" value={category.name} />
                <DetailItem
                  label="Alias"
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
                  label="Icon"
                  value={category.icon ?? "—"}
                />
                <DetailItem
                  label="Sort Order"
                  value={category.sortOrder}
                />
                <DetailItem
                  label="Status"
                  value={
                    <Badge variant={category.isActive ? "default" : "outline"}>
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <DetailItem
                  label="Created"
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

function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
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
