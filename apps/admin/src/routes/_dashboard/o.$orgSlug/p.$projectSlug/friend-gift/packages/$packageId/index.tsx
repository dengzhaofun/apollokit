import { useTenantParams } from "#/hooks/use-tenant-params";
import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Trash2, Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Checkbox } from "#/components/ui/checkbox"
import {
  useFriendGiftPackage,
  useUpdateFriendGiftPackage,
  useDeleteFriendGiftPackage,
} from "#/hooks/use-friend-gift"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/friend-gift/packages/$packageId/",
)({
  component: GiftPackageDetailPage,
})

interface GiftItemRow {
  definitionId: string
  quantity: number
}

function GiftPackageDetailPage() {
  const { packageId } = Route.useParams()
  const navigate = useNavigate()
  const { orgSlug, projectSlug } = useTenantParams()
  const [editing, setEditing] = useState(false)

  const { data: pkg, isPending, error } = useFriendGiftPackage(packageId)
  const updateMutation = useUpdateFriendGiftPackage()
  const deleteMutation = useDeleteFriendGiftPackage()

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editAlias, setEditAlias] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editIcon, setEditIcon] = useState("")
  const [editIsActive, setEditIsActive] = useState(true)
  const [editGiftItems, setEditGiftItems] = useState<GiftItemRow[]>([])

  function startEditing() {
    if (!pkg) return
    setEditName(pkg.name)
    setEditAlias(pkg.alias ?? "")
    setEditDescription(pkg.description ?? "")
    setEditIcon(pkg.icon ?? "")
    setEditIsActive(pkg.isActive)
    setEditGiftItems(
      pkg.giftItems.length > 0
        ? pkg.giftItems.map((i) => ({ ...i }))
        : [{ definitionId: "", quantity: 1 }],
    )
    setEditing(true)
  }

  function addItem() {
    setEditGiftItems([...editGiftItems, { definitionId: "", quantity: 1 }])
  }

  function removeItem(index: number) {
    setEditGiftItems(editGiftItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof GiftItemRow, value: string | number) {
    setEditGiftItems(
      editGiftItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!pkg) return
    const validItems = editGiftItems.filter((item) => item.definitionId.trim())
    try {
      await updateMutation.mutateAsync({
        id: pkg.id,
        input: {
          name: editName,
          alias: editAlias || null,
          description: editDescription || null,
          icon: editIcon || null,
          giftItems: validItems,
          isActive: editIsActive,
        },
      })
      toast.success(m.gift_package_updated())
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to update package")
      }
    }
  }

  async function handleDelete() {
    if (!pkg) return
    try {
      await deleteMutation.mutateAsync(pkg.id)
      toast.success(m.gift_package_deleted())
      navigate({ to: "/o/$orgSlug/p/$projectSlug/friend-gift" , params: { orgSlug, projectSlug }})
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to delete package")
      }
    }
  }

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !pkg) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Package not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/friend-gift" params={{ orgSlug, projectSlug }}>
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
                onClick={() => (editing ? setEditing(false) : startEditing())}
              >
                <Pencil className="size-4" />
                {editing ? m.common_cancel() : m.common_edit()}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
                {deleteMutation.isPending
                  ? m.common_deleting()
                  : m.common_delete()}
              </Button>
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editName">{m.common_name()}</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editAlias">{m.common_alias()}</Label>
                  <Input
                    id="editAlias"
                    value={editAlias}
                    onChange={(e) => setEditAlias(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editDescription">
                    {m.common_description()}
                  </Label>
                  <Input
                    id="editDescription"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editIcon">{m.common_icon()}</Label>
                  <Input
                    id="editIcon"
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                  />
                </div>

                {/* Gift Items */}
                <div className="space-y-2">
                  <Label>{m.gift_items_count()}</Label>
                  <div className="space-y-2">
                    {editGiftItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder={m.friend_gift_definition_id_placeholder()}
                          value={item.definitionId}
                          onChange={(e) =>
                            updateItem(index, "definitionId", e.target.value)
                          }
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                          className="w-24"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          disabled={editGiftItems.length <= 1}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addItem}
                  >
                    <Plus className="size-4" />
                    {m.common_add()}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editIsActive"
                    checked={editIsActive}
                    onCheckedChange={(v) => setEditIsActive(v === true)}
                  />
                  <Label htmlFor="editIsActive">{m.common_active()}</Label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    {m.common_cancel()}
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending
                      ? m.common_saving()
                      : m.common_save_changes()}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={pkg.name} />
                <DetailItem
                  label={m.common_alias()}
                  value={
                    pkg.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {pkg.alias}
                      </code>
                    ) : (
                      m.common_dash()
                    )
                  }
                />
                <DetailItem
                  label={m.common_description()}
                  value={pkg.description ?? m.common_dash()}
                />
                <DetailItem
                  label={m.common_icon()}
                  value={pkg.icon ?? m.common_dash()}
                />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge variant={pkg.isActive ? "default" : "outline"}>
                      {pkg.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_sort_order()}
                  value={pkg.sortOrder}
                />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(pkg.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label={m.common_updated()}
                  value={format(new Date(pkg.updatedAt), "yyyy-MM-dd HH:mm")}
                />
                <div className="sm:col-span-2">
                  <DetailItem
                    label={m.gift_items_count()}
                    value={
                      pkg.giftItems.length > 0 ? (
                        <div className="space-y-1">
                          {pkg.giftItems.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs"
                            >
                              <code className="rounded bg-muted px-1.5 py-0.5">
                                {item.definitionId}
                              </code>
                              <span>x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        m.common_dash()
                      )
                    }
                  />
                </div>
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
