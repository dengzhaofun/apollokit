import { useForm } from "@tanstack/react-form"

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
import { Textarea } from "#/components/ui/textarea"
import type {
  ActivityKind,
  ActivityMilestoneTier,
  CreateActivityInput,
  RewardEntry,
} from "#/lib/types/activity"

/** Convert ISO to the `<input type="datetime-local">` value format (no tz). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(val: string): string {
  if (!val) return ""
  return new Date(val).toISOString()
}

interface Props {
  defaultValues?: Partial<CreateActivityInput>
  onSubmit: (values: CreateActivityInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  disableAliasEdit?: boolean
}

export function ActivityForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "创建",
  disableAliasEdit = false,
}: Props) {
  const form = useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? "",
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      bannerImage: defaultValues?.bannerImage ?? "",
      themeColor: defaultValues?.themeColor ?? "",
      kind: defaultValues?.kind ?? ("generic" as ActivityKind),
      timezone:
        defaultValues?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibleAtLocal: toLocalInput(defaultValues?.visibleAt),
      startAtLocal: toLocalInput(defaultValues?.startAt),
      endAtLocal: toLocalInput(defaultValues?.endAt),
      rewardEndAtLocal: toLocalInput(defaultValues?.rewardEndAt),
      hiddenAtLocal: toLocalInput(defaultValues?.hiddenAt),
      currencyJson: defaultValues?.currency
        ? JSON.stringify(defaultValues.currency, null, 2)
        : "",
      milestoneTiersJson: JSON.stringify(
        defaultValues?.milestoneTiers ?? [],
        null,
        2,
      ),
      globalRewardsJson: JSON.stringify(
        defaultValues?.globalRewards ?? [],
        null,
        2,
      ),
      cleanupMode: (defaultValues?.cleanupRule?.mode ?? "purge") as
        | "purge"
        | "convert"
        | "keep",
    },
    onSubmit: async ({ value }) => {
      let milestoneTiers: ActivityMilestoneTier[] = []
      let globalRewards: RewardEntry[] = []
      let currency = null as CreateActivityInput["currency"]
      try {
        milestoneTiers = JSON.parse(
          value.milestoneTiersJson,
        ) as ActivityMilestoneTier[]
      } catch {
        /* ignore */
      }
      try {
        globalRewards = JSON.parse(value.globalRewardsJson) as RewardEntry[]
      } catch {
        /* ignore */
      }
      if (value.currencyJson.trim()) {
        try {
          currency = JSON.parse(value.currencyJson)
        } catch {
          /* ignore */
        }
      }

      await onSubmit({
        alias: value.alias,
        name: value.name,
        description: value.description || null,
        bannerImage: value.bannerImage || null,
        themeColor: value.themeColor || null,
        kind: value.kind,
        timezone: value.timezone,
        visibleAt: fromLocalInput(value.visibleAtLocal),
        startAt: fromLocalInput(value.startAtLocal),
        endAt: fromLocalInput(value.endAtLocal),
        rewardEndAt: fromLocalInput(value.rewardEndAtLocal),
        hiddenAt: fromLocalInput(value.hiddenAtLocal),
        currency,
        milestoneTiers,
        globalRewards,
        cleanupRule: { mode: value.cleanupMode as "purge" | "convert" | "keep" },
      })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <form.Field name="alias">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>活动别名 (唯一 key)</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(e.target.value.toLowerCase())
              }
              placeholder="spring_festival_2026"
              required
              disabled={disableAliasEdit}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="name">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>活动名称</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>描述</Label>
            <Textarea
              id={field.name}
              value={field.state.value ?? ""}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="kind">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>活动类型 (kind)</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ActivityKind)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generic">generic 通用</SelectItem>
                  <SelectItem value="check_in_only">check_in_only</SelectItem>
                  <SelectItem value="board_game">board_game</SelectItem>
                  <SelectItem value="gacha">gacha</SelectItem>
                  <SelectItem value="season_pass">season_pass</SelectItem>
                  <SelectItem value="custom">custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>时区 (IANA)</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <fieldset className="rounded-lg border p-4">
        <legend className="px-2 text-sm font-medium">
          时间生命周期 (本地时间, 自动转 ISO)
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="visibleAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>可见时间 visibleAt</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="startAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>开始时间 startAt</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="endAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>结束时间 endAt</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="rewardEndAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>领奖截止 rewardEndAt</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="hiddenAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>彻底隐藏 hiddenAt</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          必须满足: visibleAt ≤ startAt &lt; endAt ≤ rewardEndAt ≤ hiddenAt
        </p>
      </fieldset>

      <form.Field name="currencyJson">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>活动专属货币 (JSON, 可留空)</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              placeholder='{"alias":"festival_point","name":"春节积分","icon":"🧧"}'
            />
          </div>
        )}
      </form.Field>

      <form.Field name="milestoneTiersJson">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>里程碑 (JSON)</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              placeholder='[{"alias":"m1","points":100,"rewards":[{"type":"item","id":"gold-uuid","count":1000}]}]'
            />
          </div>
        )}
      </form.Field>

      <form.Field name="globalRewardsJson">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>通关总奖励 (JSON)</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              placeholder='[{"type":"item","id":"trophy-uuid","count":1}]'
            />
          </div>
        )}
      </form.Field>

      <form.Field name="cleanupMode">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>归档清理策略</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) =>
                field.handleChange(v as "purge" | "convert" | "keep")
              }
            >
              <SelectTrigger id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purge">purge 清除活动数据</SelectItem>
                <SelectItem value="convert">convert 兑换为通用货币</SelectItem>
                <SelectItem value="keep">keep 保留为纪念</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "提交中…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
