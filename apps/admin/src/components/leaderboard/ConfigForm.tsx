import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import * as m from "#/paraglide/messages.js"
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
  CycleMode,
  ScopeMode,
  TieBreaker,
} from "#/lib/types/leaderboard"

import type { LeaderboardFormApi } from "./use-config-form"

interface Props {
  /** Form instance owned by the caller — see `use-config-form.ts`. */
  form: LeaderboardFormApi
  isPending?: boolean
  submitLabel?: string
}

export function LeaderboardConfigForm({
  form,
  isPending,
  submitLabel,
}: Props) {
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
            <Label htmlFor={field.name}>{m.leaderboard_field_alias_label()}</Label>
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
            <Label htmlFor={field.name}>{m.common_name()}</Label>
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
            <Label htmlFor={field.name}>{m.common_description()}</Label>
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
            <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
              {m.leaderboard_field_metric_key_label()}
              <FieldHint>{m.leaderboard_field_metric_key_hint()}</FieldHint>
            </Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="pvp_score / task.claimed / level.stars"
              required
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="cycle">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.leaderboard_field_period()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as CycleMode)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{m.leaderboard_period_daily()}</SelectItem>
                  <SelectItem value="weekly">{m.leaderboard_period_weekly()}</SelectItem>
                  <SelectItem value="monthly">{m.leaderboard_period_monthly()}</SelectItem>
                  <SelectItem value="all_time">{m.leaderboard_period_all_time()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="scope">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.leaderboard_field_scope()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ScopeMode)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{m.leaderboard_scope_global()}</SelectItem>
                  <SelectItem value="guild">{m.leaderboard_scope_guild()}</SelectItem>
                  <SelectItem value="team">{m.leaderboard_scope_team()}</SelectItem>
                  <SelectItem value="friend">{m.leaderboard_scope_friend()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="aggregation">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.leaderboard_field_aggregation()}</Label>
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
                  <SelectItem value="sum">{m.leaderboard_aggregation_sum()}</SelectItem>
                  <SelectItem value="max">{m.leaderboard_aggregation_max()}</SelectItem>
                  <SelectItem value="latest">{m.leaderboard_aggregation_latest()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="tieBreaker">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.leaderboard_field_tie_breaker()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as TieBreaker)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="earliest">{m.leaderboard_tie_earliest()}</SelectItem>
                  <SelectItem value="latest">{m.leaderboard_tie_latest()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="maxEntries">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.leaderboard_field_max_entries()}</Label>
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
              <Label htmlFor={field.name}>{m.leaderboard_field_timezone()}</Label>
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
              <Label htmlFor={field.name}>{m.common_status()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ConfigStatus)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{m.leaderboard_status_draft()}</SelectItem>
                  <SelectItem value="active">{m.leaderboard_status_active()}</SelectItem>
                  <SelectItem value="paused">{m.leaderboard_status_paused()}</SelectItem>
                  <SelectItem value="archived">{m.leaderboard_status_archived()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="rewardTiersJson">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
              {m.leaderboard_field_reward_tiers_label()}
              <FieldHint>{m.leaderboard_field_reward_tiers_hint()}</FieldHint>
            </Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"from":1,"to":1,"rewards":[{"type":"item","id":"gold-uuid","count":1000}]}]'
            />
          </div>
        )}
      </form.Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? m.leaderboard_submitting() : (submitLabel ?? m.common_create())}
        </Button>
      </div>
    </form>
  )
}
