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
  CollectionEntry,
  CollectionGroup,
  CreateEntryInput,
} from "#/lib/types/collection"
import type { ItemDefinition } from "#/lib/types/item"

interface EntryFormProps {
  initial?: CollectionEntry
  groups: CollectionGroup[]
  itemDefinitions: ItemDefinition[]
  onSubmit: (values: CreateEntryInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  onCancel?: () => void
}

// "__none__" is the sentinel value used in the group/item Select since
// shadcn's Select cannot represent the empty string as a selectable value.
const NONE = "__none__"

export function EntryForm({
  initial,
  groups,
  itemDefinitions,
  onSubmit,
  submitLabel,
  isPending,
  onCancel,
}: EntryFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [image, setImage] = useState(initial?.image ?? "")
  const [rarity, setRarity] = useState(initial?.rarity ?? "")
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? NONE)
  const [triggerItemDefinitionId, setTriggerDef] = useState<string>(
    initial?.triggerItemDefinitionId ?? NONE,
  )
  const [triggerQuantity, setTriggerQuantity] = useState<number>(
    initial?.triggerQuantity ?? 1,
  )
  const [hiddenUntilUnlocked, setHidden] = useState<boolean>(
    initial?.hiddenUntilUnlocked ?? false,
  )
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name,
      alias: alias || null,
      description: description || null,
      image: image || null,
      rarity: rarity || null,
      groupId: groupId === NONE ? null : groupId,
      triggerItemDefinitionId:
        triggerItemDefinitionId === NONE ? null : triggerItemDefinitionId,
      triggerQuantity,
      hiddenUntilUnlocked: hiddenUntilUnlocked,
      sortOrder,
      triggerType: "item",
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="e-name">名称</Label>
          <Input
            id="e-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="e-alias">别名 (可选)</Label>
          <Input
            id="e-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="e-description">描述</Label>
        <Textarea
          id="e-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="e-image">图片 URL</Label>
          <Input
            id="e-image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="e-rarity">稀有度</Label>
          <Input
            id="e-rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            placeholder="common / rare / sr / ssr"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="e-group">分组</Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger id="e-group">
              <SelectValue placeholder="选择分组 (可选)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>-- 无分组 --</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="e-trigger">解锁物品</Label>
          <Select
            value={triggerItemDefinitionId}
            onValueChange={setTriggerDef}
          >
            <SelectTrigger id="e-trigger">
              <SelectValue placeholder="选择触发物品" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>-- 未绑定 --</SelectItem>
              {itemDefinitions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            玩家持有此物品达到阈值即解锁
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="e-quantity">所需数量</Label>
          <Input
            id="e-quantity"
            type="number"
            min={1}
            value={triggerQuantity}
            onChange={(e) => setTriggerQuantity(Number(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor="e-sortOrder">排序</Label>
          <Input
            id="e-sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Switch
            id="e-hidden"
            checked={hiddenUntilUnlocked}
            onCheckedChange={setHidden}
          />
          <Label htmlFor="e-hidden">未解锁时隐藏</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
