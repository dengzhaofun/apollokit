import { useState } from "react"

import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { FieldDescription } from "#/components/ui/field-hint"
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
import * as m from "#/paraglide/messages.js"
import type {
  CollectionEntry,
  CollectionGroup,
  CollectionMilestone,
  CreateMilestoneInput,
  MilestoneScope,
} from "#/lib/types/collection"
import type { RewardEntry } from "#/lib/types/rewards"

interface MilestoneFormProps {
  initial?: CollectionMilestone
  groups: CollectionGroup[]
  entries: CollectionEntry[]
  onSubmit: (values: CreateMilestoneInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  onCancel?: () => void
}

export function MilestoneForm({
  initial,
  groups,
  entries,
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
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
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
      setError(m.collection_milestone_error_no_reward())
      return
    }
    if (rewardItems.some((r) => !r.id)) {
      setError(m.collection_milestone_error_reward_def())
      return
    }
    if (scope === "entry" && !entryId) {
      setError(m.collection_milestone_error_entry_required())
      return
    }
    if (scope === "group" && !groupId) {
      setError(m.collection_milestone_error_group_required())
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
          <Label htmlFor="m-scope">
            {m.collection_milestone_field_scope()}
          </Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as MilestoneScope)}
            disabled={!!initial}
          >
            <SelectTrigger id="m-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">
                {m.collection_milestone_scope_entry()}
              </SelectItem>
              <SelectItem value="group">
                {m.collection_milestone_scope_group()}
              </SelectItem>
              <SelectItem value="album">
                {m.collection_milestone_scope_album()}
              </SelectItem>
            </SelectContent>
          </Select>
          {initial ? (
            <FieldDescription className="mt-1">
              {m.collection_milestone_scope_locked()}
            </FieldDescription>
          ) : null}
        </div>
        {scope === "entry" ? (
          <div className="md:col-span-2">
            <Label htmlFor="m-entry">
              {m.collection_milestone_field_entry()}
            </Label>
            <Select value={entryId} onValueChange={setEntryId}>
              <SelectTrigger id="m-entry">
                <SelectValue
                  placeholder={m.collection_milestone_entry_placeholder()}
                />
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
              <Label htmlFor="m-group">
                {m.collection_milestone_field_group()}
              </Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="m-group">
                  <SelectValue
                    placeholder={m.collection_milestone_group_placeholder()}
                  />
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
              <Label htmlFor="m-threshold-g">
                {m.collection_milestone_field_threshold()}
              </Label>
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
            <Label htmlFor="m-threshold-a">
              {m.collection_milestone_field_threshold()}
            </Label>
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
        <Label htmlFor="m-label">
          {m.collection_milestone_field_label()}
        </Label>
        <Input
          id="m-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={m.collection_milestone_label_placeholder()}
        />
      </div>
      <RewardEntryEditor
        label={m.collection_milestone_field_rewards()}
        entries={rewardItems}
        onChange={setRewardItems}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="m-sortOrder">
            {m.collection_field_sort_order()}
          </Label>
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
          <Label htmlFor="m-autoClaim">
            {m.collection_milestone_field_auto_claim()}
          </Label>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? m.collection_saving() : submitLabel}
        </Button>
      </div>
    </form>
  )
}
