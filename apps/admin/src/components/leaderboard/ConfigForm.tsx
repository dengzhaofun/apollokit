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
  AggregationMode,
  ConfigStatus,
  CreateLeaderboardInput,
  CycleMode,
  RewardTier,
  ScopeMode,
  TieBreaker,
} from "#/lib/types/leaderboard"

interface Props {
  defaultValues?: Partial<CreateLeaderboardInput>
  onSubmit: (values: CreateLeaderboardInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function LeaderboardConfigForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "创建",
}: Props) {
  const form = useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? "",
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      metricKey: defaultValues?.metricKey ?? "",
      cycle: defaultValues?.cycle ?? ("daily" as CycleMode),
      weekStartsOn: defaultValues?.weekStartsOn ?? 1,
      timezone:
        defaultValues?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      scope: defaultValues?.scope ?? ("global" as ScopeMode),
      aggregation: defaultValues?.aggregation ?? ("sum" as AggregationMode),
      maxEntries: defaultValues?.maxEntries ?? 1000,
      tieBreaker: defaultValues?.tieBreaker ?? ("earliest" as TieBreaker),
      status: defaultValues?.status ?? ("active" as ConfigStatus),
      rewardTiersJson: JSON.stringify(
        defaultValues?.rewardTiers ?? [],
        null,
        2,
      ),
    },
    onSubmit: async ({ value }) => {
      let tiers: RewardTier[] = []
      try {
        tiers = JSON.parse(value.rewardTiersJson) as RewardTier[]
      } catch {
        tiers = []
      }
      await onSubmit({
        alias: value.alias,
        name: value.name,
        description: value.description || null,
        metricKey: value.metricKey,
        cycle: value.cycle,
        weekStartsOn: value.weekStartsOn,
        timezone: value.timezone,
        scope: value.scope,
        aggregation: value.aggregation,
        maxEntries: value.maxEntries,
        tieBreaker: value.tieBreaker,
        status: value.status,
        rewardTiers: tiers,
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
            <Label htmlFor={field.name}>别名 (唯一 key)</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(e.target.value.toLowerCase())
              }
              placeholder="pvp_score_weekly"
              required
            />
          </div>
        )}
      </form.Field>

      <form.Field name="name">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>名称</Label>
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

      <form.Field name="metricKey">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>指标 key (metricKey)</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="pvp_score / task.claimed / level.stars"
              required
            />
            <p className="text-xs text-muted-foreground">
              其他模块调用 contribute 时匹配此 key；可被多个 config 订阅。
            </p>
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="cycle">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>周期</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as CycleMode)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">daily 日榜</SelectItem>
                  <SelectItem value="weekly">weekly 周榜</SelectItem>
                  <SelectItem value="monthly">monthly 月榜</SelectItem>
                  <SelectItem value="all_time">all_time 总榜</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="scope">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>作用域</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ScopeMode)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">global 全局</SelectItem>
                  <SelectItem value="guild">guild 公会</SelectItem>
                  <SelectItem value="team">team 战队</SelectItem>
                  <SelectItem value="friend">friend 好友</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="aggregation">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>聚合方式</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) =>
                  field.handleChange(v as AggregationMode)
                }
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">sum 累加</SelectItem>
                  <SelectItem value="max">max 取最大</SelectItem>
                  <SelectItem value="latest">latest 覆盖</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="tieBreaker">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>并列规则</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as TieBreaker)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="earliest">earliest 先达到者</SelectItem>
                  <SelectItem value="latest">latest 后达到者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="maxEntries">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>最大保留条数</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                max={100000}
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>时区</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>状态</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ConfigStatus)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft 草稿</SelectItem>
                  <SelectItem value="active">active 活跃</SelectItem>
                  <SelectItem value="paused">paused 暂停</SelectItem>
                  <SelectItem value="archived">archived 已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="rewardTiersJson">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>
              奖励阶梯 (JSON,
              可选)
            </Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"from":1,"to":1,"rewards":[{"type":"item","id":"gold-uuid","count":1000}]}]'
            />
            <p className="text-xs text-muted-foreground">
              周期结算时按排名区间发奖，走 mail 幂等投递
            </p>
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
