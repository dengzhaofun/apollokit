import { useState } from "react"

import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import type { RewardEntry } from "#/lib/types/rewards"
import type {
  CreateShopGrowthStageInput,
  ShopGrowthTriggerType,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"

interface StageFormProps {
  defaultValues?: Partial<CreateShopGrowthStageInput>
  onSubmit: (input: CreateShopGrowthStageInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function StageForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: StageFormProps) {
  const [stageIndex, setStageIndex] = useState(defaultValues?.stageIndex ?? 1)
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [description, setDescription] = useState(
    defaultValues?.description ?? "",
  )
  const [triggerType, setTriggerType] = useState<ShopGrowthTriggerType>(
    defaultValues?.triggerType ?? "accumulated_cost",
  )
  const [triggerConfigText, setTriggerConfigText] = useState(
    defaultValues?.triggerConfig
      ? JSON.stringify(defaultValues.triggerConfig, null, 2)
      : "",
  )
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
    defaultValues?.rewardItems ?? [],
  )
  const [sortOrder, setSortOrder] = useState(defaultValues?.sortOrder ?? 0)
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!name.trim()) {
      setError(m.common_name())
      return
    }
    let parsed: Record<string, unknown> | null = null
    if (triggerConfigText.trim()) {
      try {
        parsed = JSON.parse(triggerConfigText)
      } catch {
        setError("Invalid JSON in trigger config")
        return
      }
    }
    const validRewards = rewardItems.filter((e) => e.id && e.count > 0)
    onSubmit({
      stageIndex,
      name: name.trim(),
      description: description || null,
      triggerType,
      triggerConfig: parsed,
      rewardItems: validRewards,
      sortOrder,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stage-index">{m.shop_stage_index()}</Label>
          <Input
            id="stage-index"
            type="number"
            min={1}
            value={stageIndex}
            onChange={(e) => setStageIndex(Number(e.target.value) || 1)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stage-sort">{m.shop_sort_order()}</Label>
          <Input
            id="stage-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage-name">{m.common_name()} *</Label>
        <Input
          id="stage-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage-desc">{m.common_description()}</Label>
        <Textarea
          id="stage-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage-trigger">{m.shop_trigger_type()}</Label>
        <Select
          value={triggerType}
          onValueChange={(v) => setTriggerType(v as ShopGrowthTriggerType)}
        >
          <SelectTrigger id="stage-trigger" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="accumulated_cost">
              {m.shop_trigger_accumulated_cost()}
            </SelectItem>
            <SelectItem value="accumulated_payment">
              {m.shop_trigger_accumulated_payment()}
            </SelectItem>
            <SelectItem value="custom_metric">
              {m.shop_trigger_custom_metric()}
            </SelectItem>
            <SelectItem value="manual">{m.shop_trigger_manual()}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage-config" className="inline-flex items-center gap-1.5">
          {m.shop_trigger_config()}
          <FieldHint>{m.shop_trigger_config_hint()}</FieldHint>
        </Label>
        <Textarea
          id="stage-config"
          value={triggerConfigText}
          onChange={(e) => setTriggerConfigText(e.target.value)}
          rows={4}
          placeholder='{ "itemDefinitionId": "<uuid>", "threshold": 1000 }'
          className="font-mono text-xs"
        />
      </div>

      <RewardEntryEditor
        label={m.shop_reward_items()}
        entries={rewardItems}
        onChange={setRewardItems}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
      </Button>
    </form>
  )
}
