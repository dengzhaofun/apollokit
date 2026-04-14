import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { DefinitionForm } from "#/components/item/DefinitionForm"
import { DeleteItemDialog } from "#/components/item/DeleteItemDialog"
import {
  useItemDefinition,
  useUpdateItemDefinition,
  useDeleteItemDefinition,
} from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/item/definitions/$definitionId/",
)({
  component: DefinitionDetailPage,
})

function stackLabel(def: {
  stackable: boolean
  stackLimit: number | null
}): string {
  if (!def.stackable) return "Non-stackable"
  if (def.stackLimit == null) return "Unlimited (currency)"
  return `Stack limit: ${def.stackLimit}`
}

function DefinitionDetailPage() {
  const { definitionId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: definition, isPending, error } = useItemDefinition(definitionId)
  const updateMutation = useUpdateItemDefinition()
  const deleteMutation = useDeleteItemDefinition()

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

  if (error || !definition) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Definition not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={definition.name} />

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
                name={definition.name}
                description="This will permanently delete this item definition and all inventory data associated with it."
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(definition.id)
                    toast.success("Definition deleted")
                    navigate({ to: "/item" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to delete definition",
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <DefinitionForm
                defaultValues={{
                  name: definition.name,
                  alias: definition.alias,
                  categoryId: definition.categoryId,
                  description: definition.description,
                  icon: definition.icon,
                  stackable: definition.stackable,
                  stackLimit: definition.stackLimit,
                  holdLimit: definition.holdLimit,
                  lotteryPoolId: definition.lotteryPoolId,
                  isActive: definition.isActive,
                }}
                submitLabel="Save Changes"
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: definition.id,
                      ...values,
                    })
                    toast.success("Definition updated")
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to update definition",
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Name" value={definition.name} />
                <DetailItem
                  label="Alias"
                  value={
                    definition.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {definition.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label="Type"
                  value={
                    <Badge variant="secondary">
                      {stackLabel(definition)}
                    </Badge>
                  }
                />
                <DetailItem
                  label="Hold Limit"
                  value={definition.holdLimit ?? "—"}
                />
                <DetailItem
                  label="Status"
                  value={
                    <Badge
                      variant={definition.isActive ? "default" : "outline"}
                    >
                      {definition.isActive ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <DetailItem
                  label="Icon"
                  value={definition.icon ?? "—"}
                />
                <DetailItem
                  label="Lottery Pool"
                  value={definition.lotteryPoolId ?? "—"}
                />
                <DetailItem
                  label="Created"
                  value={format(
                    new Date(definition.createdAt),
                    "yyyy-MM-dd HH:mm",
                  )}
                />
                <DetailItem
                  label="Updated"
                  value={format(
                    new Date(definition.updatedAt),
                    "yyyy-MM-dd HH:mm",
                  )}
                />
                {definition.description && (
                  <div className="sm:col-span-2">
                    <DetailItem
                      label="Description"
                      value={definition.description}
                    />
                  </div>
                )}
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
