import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Checkbox } from "#/components/ui/checkbox"
import { useCreateFriendGiftPackage } from "#/hooks/use-friend-gift"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/friend-gift/packages/create",
)({
  component: GiftPackageCreatePage,
})

interface GiftItemRow {
  definitionId: string
  quantity: number
}

function GiftPackageCreatePage() {
  const navigate = useNavigate()
  const { orgSlug, projectSlug } = useTenantParams()
  const createMutation = useCreateFriendGiftPackage()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [sortOrder, setSortOrder] = useState(0)
  const [giftItems, setGiftItems] = useState<GiftItemRow[]>([
    { definitionId: "", quantity: 1 },
  ])

  function addItem() {
    setGiftItems([...giftItems, { definitionId: "", quantity: 1 }])
  }

  function removeItem(index: number) {
    setGiftItems(giftItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof GiftItemRow, value: string | number) {
    setGiftItems(
      giftItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validItems = giftItems.filter((item) => item.definitionId.trim())
    try {
      await createMutation.mutateAsync({
        name,
        alias: alias || null,
        description: description || null,
        icon: icon || null,
        giftItems: validItems,
        isActive,
      })
      toast.success(m.gift_package_created())
      navigate({ to: "/o/$orgSlug/p/$projectSlug/friend-gift" , params: { orgSlug, projectSlug }})
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to create gift package")
      }
    }
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{m.common_name()}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alias">{m.common_alias()}</Label>
              <Input
                id="alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{m.common_description()}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{m.common_icon()}</Label>
              <MediaPickerDialog value={icon || null} onChange={setIcon} />
            </div>

            {/* Gift Items */}
            <div className="space-y-2">
              <Label>{m.gift_items_count()}</Label>
              <div className="space-y-2">
                {giftItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Definition ID"
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
                        updateItem(index, "quantity", Number(e.target.value))
                      }
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      disabled={giftItems.length <= 1}
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

            <div className="space-y-2">
              <Label htmlFor="sortOrder">{m.common_sort_order()}</Label>
              <Input
                id="sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(v) => setIsActive(v === true)}
              />
              <Label htmlFor="isActive">{m.common_active()}</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/o/$orgSlug/p/$projectSlug/friend-gift", params: { orgSlug, projectSlug } })}
              >
                {m.common_cancel()}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? m.common_saving()
                  : m.common_create()}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
