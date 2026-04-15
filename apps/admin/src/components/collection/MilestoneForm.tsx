import { useState } from "react"

import { ItemEntryEditor } from "#/components/shop/ItemEntryEditor"
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
import type {
  CollectionEntry,
  CollectionGroup,
  CollectionMilestone,
  CreateMilestoneInput,
  MilestoneScope,
} from "#/lib/types/collection"
import type { ItemDefinition, ItemEntry } from "#/lib/types/item"

interface MilestoneFormProps {
  initial?: CollectionMilestone
  groups: CollectionGroup[]
  entries: CollectionEntry[]
  itemDefinitions: ItemDefinition[]
  onSubmit: (values: CreateMilestoneInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  onCancel?: () => void
}

export function MilestoneForm({
  initial,
  groups,
  entries,
  itemDefinitions,
  onSubmit,
  submitLabel,
  isPending,
  onCancel,
}: MilestoneFormProps) {
  const [scope, setScope] = useState<MilestoneScope>(
    (initial?.scope as MilestoneScope) ?? "album",
  )
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? "")
  const [entryId, setEntryId] = useState<string>(initial?.entryId ?? "")
  const [threshold, setThreshold] = useState<number>(initial?.threshold ?? 1)
  const [label, setLabel] = useState<string>(initial?.label ?? "")
  const [rewardItems, setRewardItems] = useState<ItemEntry[]>(
    initial?.rewardItems ?? [],
  )
  const [autoClaim, setAutoClaim] = useState<boolean>(
    initial?.autoClaim ?? false,
  )
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (rewardItems.length === 0) {
      setError("请至少添加一个奖励物品")
      return
    }
    if (rewardItems.some((r) => !r.definitionId)) {
      setError("请为所有奖励物品选择道具")
      return
    }
    if (scope === "entry" && !entryId) {
      setError("entry 范围下必须选择条目")
      return
    }
    if (scope === "group" && !groupId) {
      setError("group 范围下必须选择分组")
      return
    }

    const payload: CreateMilestoneInput = {
      scope,
      label: label || null,
      rewardItems,
      autoClaim,
      sortOrder,
    }
    if (scope === "entry") {
      payload.entryId = entryId
    } else if (scope === "group") {
      payload.groupId = groupId
      payload.threshold = threshold
    } else {
      payload.threshold = threshold
    }
    await onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="m-scope">范围</Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as MilestoneScope)}
            disabled={!!initial}
          >
            <SelectTrigger id="m-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">条目 (首次解锁)</SelectItem>
              <SelectItem value="group">分组 (集齐 N 个)</SelectItem>
              <SelectItem value="album">整本 (集齐 N 个)</SelectItem>
            </SelectContent>
          </Select>
          {initial ? (
            <p className="mt-1 text-xs text-muted-foreground">
              创建后不可更改范围
            </p>
          ) : null}
        </div>
        {scope === "entry" ? (
          <div className="md:col-span-2">
            <Label htmlFor="m-entry">条目</Label>
            <Select value={entryId} onValueChange={setEntryId}>
              <SelectTrigger id="m-entry">
                <SelectValue placeholder="选择条目" />
              </SelectTrigger>
              <SelectContent>
                {entries.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {scope === "group" ? (
          <>
            <div>
              <Label htmlFor="m-group">分组</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="m-group">
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="m-threshold-g">阈值</Label>
              <Input
                id="m-threshold-g"
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 1)}
              />
            </div>
          </>
        ) : null}
        {scope === "album" ? (
          <div>
            <Label htmlFor="m-threshold-a">阈值</Label>
            <Input
              id="m-threshold-a"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 1)}
            />
          </div>
        ) : null}
      </div>
      <div>
        <Label htmlFor="m-label">显示文案</Label>
        <Input
          id="m-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="如 集齐 5 张火系卡"
        />
      </div>
      <ItemEntryEditor
        label="奖励"
        entries={rewardItems}
        onChange={setRewardItems}
        definitions={itemDefinitions}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="m-sortOrder">排序</Label>
          <Input
            id="m-sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Switch
            id="m-autoClaim"
            checked={autoClaim}
            onCheckedChange={setAutoClaim}
          />
          <Label htmlFor="m-autoClaim">自动发放 (通过邮件)</Label>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
