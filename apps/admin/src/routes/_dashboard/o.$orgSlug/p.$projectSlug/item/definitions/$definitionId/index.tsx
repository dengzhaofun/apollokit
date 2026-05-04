import { useTenantParams } from "#/hooks/use-tenant-params";
import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

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
  "/_dashboard/o/$orgSlug/p/$projectSlug/item/definitions/$definitionId/",
)({
  component: DefinitionDetailPage,
})

function stackLabel(def: {
  stackable: boolean
  stackLimit: number | null
}): string {
  if (!def.stackable) return m.item_non_stackable()
  if (def.stackLimit == null) return m.item_unlimited_currency()
  return `Stack limit: ${def.stackLimit}`
}

function DefinitionDetailPage() {
  const { definitionId } = Route.useParams()
  const navigate = useNavigate()
  const { orgSlug, projectSlug } = useTenantParams()
  const [editing, setEditing] = useState(false)

  const { data: definition, isPending, error } = useItemDefinition(definitionId)
  const updateMutation = useUpdateItemDefinition()
  const deleteMutation = useDeleteItemDefinition()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !definition) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Definition not found"}
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
                <Link to="/o/$orgSlug/p/$projectSlug/item/definitions" params={{ orgSlug, projectSlug }}>
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
                name={definition.name}
                description={m.item_delete_definition_desc()}
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(definition.id)
                    toast.success(m.item_definition_deleted())
                    navigate({ to: "/o/$orgSlug/p/$projectSlug/item/definitions" , params: { orgSlug, projectSlug }})
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.item_failed_delete_definition(),
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
                submitLabel={m.common_save_changes()}
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: definition.id,
                      ...values,
                    })
                    toast.success(m.item_definition_updated())
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
                <DetailItem label={m.common_name()} value={definition.name} />
                <DetailItem
                  label={m.common_alias()}
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
                  label={m.common_type()}
                  value={
                    <Badge variant="secondary">
                      {stackLabel(definition)}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.item_hold_limit()}
                  value={definition.holdLimit ?? "—"}
                />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge
                      variant={definition.isActive ? "default" : "outline"}
                    >
                      {definition.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_icon()}
                  value={definition.icon ?? "—"}
                />
                <DetailItem
                  label={m.common_created()}
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
                      label={m.common_description()}
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
