import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type {
  CreateShopCategoryInput,
  ShopCategory,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"

interface CategoryFormProps {
  defaultValues?: Partial<CreateShopCategoryInput>
  parents: ShopCategory[]
  onSubmit: (input: CreateShopCategoryInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  excludeId?: string
}

export function CategoryForm({
  defaultValues,
  parents,
  onSubmit,
  isPending,
  submitLabel,
  excludeId,
}: CategoryFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [alias, setAlias] = useState(defaultValues?.alias ?? "")
  const [parentId, setParentId] = useState<string>(
    defaultValues?.parentId ?? "__none__",
  )
  const [description, setDescription] = useState(
    defaultValues?.description ?? "",
  )
  const [coverImage, setCoverImage] = useState(defaultValues?.coverImage ?? "")
  const [icon, setIcon] = useState(defaultValues?.icon ?? "")
  const [sortOrder, setSortOrder] = useState(defaultValues?.sortOrder ?? 0)
  const [isActive, setIsActive] = useState(defaultValues?.isActive ?? true)

  const parentOptions = parents.filter((p) => p.id !== excludeId)

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({
          name: name.trim(),
          alias: alias || null,
          parentId: parentId === "__none__" ? null : parentId,
          description: description || null,
          coverImage: coverImage || null,
          icon: icon || null,
          sortOrder,
          isActive,
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="cat-name">{m.common_name()} *</Label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cat-alias">{m.common_alias()}</Label>
          <Input
            id="cat-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-parent">{m.shop_parent_category()}</Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger id="cat-parent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{m.shop_top_level()}</SelectItem>
              {parentOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cat-desc">{m.common_description()}</Label>
        <Textarea
          id="cat-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cat-cover">{m.shop_cover_image()}</Label>
          <Input
            id="cat-cover"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-icon">{m.common_icon()}</Label>
          <Input
            id="cat-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cat-sort">{m.shop_sort_order()}</Label>
        <Input
          id="cat-sort"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="cat-active"
          checked={isActive}
          onCheckedChange={(c) => setIsActive(c === true)}
        />
        <Label htmlFor="cat-active">{m.common_active()}</Label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
      </Button>
    </form>
  )
}
