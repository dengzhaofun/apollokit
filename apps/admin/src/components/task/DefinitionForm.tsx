import { useForm } from "@tanstack/react-form"
import { useMemo } from "react"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import {
  RewardScheduleSection,
  type RewardScheduleKeyFieldsProps,
  type RewardTrack,
} from "#/components/rewards/RewardScheduleSection"
import type {
  CountingMethod,
  CreateDefinitionInput,
  TaskCategory,
  TaskPeriod,
  TaskRewardTier,
} from "#/lib/types/task"
import type { RewardEntry } from "#/lib/types/rewards"

interface DefinitionFormProps {
  defaultValues?: Partial<CreateDefinitionInput>
  categories?: TaskCategory[]
  onSubmit: (values: CreateDefinitionInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function DefinitionForm({
  defaultValues,
  categories = [],
  onSubmit,
  isPending,
  submitLabel = m.common_create(),
}: DefinitionFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      categoryId: defaultValues?.categoryId ?? "",
      period: defaultValues?.period ?? "daily",
      countingMethod: defaultValues?.countingMethod ?? "event_count",
      eventName: defaultValues?.eventName ?? "",
      eventValueField: defaultValues?.eventValueField ?? "",
      filter: defaultValues?.filter ?? "",
      targetValue: defaultValues?.targetValue ?? 1,
      parentProgressValue: defaultValues?.parentProgressValue ?? 1,
      autoClaim: defaultValues?.autoClaim ?? false,
      isActive: defaultValues?.isActive ?? true,
      isHidden: defaultValues?.isHidden ?? false,
      visibility:
        (defaultValues?.visibility as "broadcast" | "assigned" | undefined) ??
        "broadcast",
      defaultAssignmentTtlSeconds:
        defaultValues?.defaultAssignmentTtlSeconds ?? ("" as number | ""),
      activityId: defaultValues?.activityId ?? (null as string | null),
      rewards: (defaultValues?.rewards ?? []) as RewardEntry[],
      rewardTiers: (defaultValues?.rewardTiers ?? []) as TaskRewardTier[],
    },
    onSubmit: async ({ value }) => {
      const isEventBased =
        value.countingMethod === "event_count" ||
        value.countingMethod === "event_value"
      const trimmedFilter = value.filter.trim()

      const ttlRaw = value.defaultAssignmentTtlSeconds
      const ttlSeconds =
        ttlRaw === "" || ttlRaw == null ? null : Number(ttlRaw)

      const sortedTiers = [...value.rewardTiers].sort(
        (a, b) => a.threshold - b.threshold,
      )

      const input: CreateDefinitionInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        categoryId: value.categoryId || null,
        period: value.period as CreateDefinitionInput["period"],
        countingMethod: value.countingMethod as CreateDefinitionInput["countingMethod"],
        eventName: value.eventName || null,
        eventValueField: value.eventValueField || null,
        filter: isEventBased && trimmedFilter ? trimmedFilter : null,
        targetValue: value.targetValue,
        parentProgressValue: value.parentProgressValue,
        autoClaim: value.autoClaim,
        isActive: value.isActive,
        isHidden: value.isHidden,
        visibility: value.visibility,
        defaultAssignmentTtlSeconds:
          value.visibility === "assigned" ? ttlSeconds : null,
        activityId: value.activityId,
        rewards: value.rewards,
        rewardTiers: sortedTiers,
      }
      await onSubmit(input)
    },
  })

  const tierTracks = useMemo<RewardTrack<TierDraft>[]>(
    () => [
      {
        id: "main",
        label: m.reward_section_title(),
        getRewards: (d) => d.rewards,
        setRewards: (d, rewards) => ({ ...d, rewards }),
      },
    ],
    [],
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value ? "Name is required" : value.length > 200 ? "Max 200 characters" : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Win 3 Battles"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_alias()}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. win-3-battles (lowercase, digits, hyphens, underscores)"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_description()}</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="categoryId">
          {(field) => (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="period">
          {(field) => (
            <div className="space-y-2">
              <Label>Period *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as TaskPeriod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="none">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="countingMethod">
          {(field) => (
            <div className="space-y-2">
              <Label>Counting Method *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as CountingMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event_count">Event Count (+1 per event)</SelectItem>
                  <SelectItem value="event_value">Event Value (accumulate field)</SelectItem>
                  <SelectItem value="child_completion">Child Completion (SUM children)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="targetValue">
          {(field) => (
            <div className="space-y-2">
              <Label>Target Value *</Label>
              <Input
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="eventName">
        {(field) => (
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              Event Name
              <FieldHint>
                Required for event_count and event_value methods.
              </FieldHint>
            </Label>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. purchase, login, battle_win"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="eventValueField">
        {(field) => (
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              Event Value Field
              <FieldHint>
                Dot-path into event data for event_value counting.
              </FieldHint>
            </Label>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. amount"
            />
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.countingMethod}>
        {(countingMethod) => {
          const isEventBased =
            countingMethod === "event_count" ||
            countingMethod === "event_value"
          if (!isEventBased) return null
          return (
            <form.Field name="filter">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                    Filter Expression
                    <FieldHint>
                      {m.task_field_filter_hint()}
                      {" "}
                      {m.task_field_filter_syntax_hint()}
                    </FieldHint>
                  </Label>
                  <Textarea
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    rows={3}
                    className="font-mono text-xs"
                    placeholder={'monsterId == "dragon" and stats.level >= 10'}
                  />
                </div>
              )}
            </form.Field>
          )
        }}
      </form.Subscribe>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="parentProgressValue">
          {(field) => (
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5">
                Parent Progress Value
                <FieldHint>
                  Progress contributed to parent task on completion.
                </FieldHint>
              </Label>
              <Input
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>

      </div>

      <div className="flex items-center gap-6">
        <form.Field name="autoClaim">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="autoClaim"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="autoClaim">Auto-claim via mail</Label>
            </div>
          )}
        </form.Field>

        <form.Field name="isHidden">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="isHidden"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="isHidden">Hidden until prerequisites met</Label>
            </div>
          )}
        </form.Field>

        <form.Field name="isActive">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="isActive">{m.common_active()}</Label>
            </div>
          )}
        </form.Field>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label className="inline-flex items-center gap-1.5">
              {m.task_visibility_label()}
              <FieldHint>{m.task_visibility_hint()}</FieldHint>
            </Label>
          </div>
          <form.Field name="visibility">
            {(field) => (
              <Select
                value={field.state.value}
                onValueChange={(v) =>
                  field.handleChange(v as "broadcast" | "assigned")
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">
                    {m.task_visibility_broadcast()}
                  </SelectItem>
                  <SelectItem value="assigned">
                    {m.task_visibility_assigned()}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => state.values.visibility}>
          {(visibility) =>
            visibility === "assigned" ? (
              <form.Field name="defaultAssignmentTtlSeconds">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                      {m.task_default_ttl_label()}
                      <FieldHint>{m.task_default_ttl_hint()}</FieldHint>
                    </Label>
                    <Input
                      id={field.name}
                      type="number"
                      min={1}
                      placeholder={m.task_default_ttl_placeholder()}
                      value={field.state.value === "" ? "" : field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        const v = e.target.value
                        field.handleChange(v === "" ? "" : Number(v))
                      }}
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </div>

      <form.Field name="rewards">
        {(field) => (
          <RewardEntryEditor
            label={m.task_field_terminal_rewards_label()}
            hint={m.task_field_terminal_rewards_hint()}
            entries={field.state.value}
            onChange={(next) => field.handleChange(next)}
          />
        )}
      </form.Field>

      <form.Field name="rewardTiers">
        {(field) => {
          const drafts = tiersToDrafts(field.state.value)
          const setDrafts = (next: TierDraft[]) =>
            field.handleChange(draftsToTiers(next))
          return (
            <RewardScheduleSection<TierDraft>
              title={m.task_field_reward_tiers_label()}
              description={m.task_field_reward_tiers_hint()}
              list={drafts}
              getId={(d) => d.id}
              keyLabel={(d) =>
                d.alias
                  ? `${d.alias} · ${m.task_tier_threshold()} ${d.threshold}`
                  : `${m.task_tier_threshold()} ${d.threshold}`
              }
              newDraft={() => {
                const maxThreshold = drafts.reduce(
                  (max, d) => Math.max(max, d.threshold),
                  0,
                )
                return {
                  id: `tier-new-${Date.now()}`,
                  alias: `tier-${drafts.length + 1}`,
                  threshold: maxThreshold + 1,
                  rewards: [],
                }
              }}
              KeyFields={TierKeyFields}
              validate={(d) => {
                if (!d.alias.trim()) return m.reward_key_required()
                if (!Number.isFinite(d.threshold) || d.threshold < 1) {
                  return m.reward_key_required()
                }
                return null
              }}
              tracks={tierTracks}
              onCreate={async (draft) => {
                setDrafts([...drafts, draft])
              }}
              onUpdate={async (draft) => {
                setDrafts(drafts.map((d) => (d.id === draft.id ? draft : d)))
              }}
              onDelete={async (draft) => {
                setDrafts(drafts.filter((d) => d.id !== draft.id))
              }}
            />
          )
        }}
      </form.Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : submitLabel}
      </Button>
    </form>
  )
}

type TierDraft = {
  id: string
  alias: string
  threshold: number
  rewards: RewardEntry[]
}

function tiersToDrafts(tiers: TaskRewardTier[]): TierDraft[] {
  return tiers.map((t, i) => ({
    id: `tier-${t.alias || i}`,
    alias: t.alias,
    threshold: t.threshold,
    rewards: t.rewards,
  }))
}

function draftsToTiers(drafts: TierDraft[]): TaskRewardTier[] {
  return drafts.map(({ alias, threshold, rewards }) => ({
    alias,
    threshold,
    rewards,
  }))
}

function TierKeyFields({
  draft,
  onChange,
}: RewardScheduleKeyFieldsProps<TierDraft>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="tier-alias">{m.task_tier_alias()}</Label>
        <Input
          id="tier-alias"
          value={draft.alias}
          onChange={(e) => onChange({ ...draft, alias: e.target.value })}
          placeholder="tier-1"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier-threshold">{m.task_tier_threshold()}</Label>
        <Input
          id="tier-threshold"
          type="number"
          min={1}
          value={draft.threshold}
          onChange={(e) =>
            onChange({ ...draft, threshold: Number(e.target.value) || 1 })
          }
        />
      </div>
    </div>
  )
}
