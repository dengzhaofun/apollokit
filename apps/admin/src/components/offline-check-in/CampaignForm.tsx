/**
 * Form for creating / editing an offline-check-in campaign.
 *
 * The completion-rule editor switches shape based on `mode` — `daily` mode
 * defaults to `{ kind: "daily_total", days }` and `collect` mode toggles
 * between `{ kind: "all" }` and `{ kind: "n_of_m", n }`.
 */

import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import { FieldHint } from "#/components/ui/field-hint"
import * as m from "#/paraglide/messages.js"

import type { CampaignFormApi } from "./use-campaign-form"
import type {
  OfflineCheckInCompletionRule,
  OfflineCheckInMode,
} from "#/lib/types/offline-check-in"

const TIMEZONES = Intl.supportedValuesOf("timeZone")

interface Props {
  form: CampaignFormApi
  isPending?: boolean
  id?: string
  onStateChange?: (state: FormBridgeState) => void
}

export function CampaignForm({ form, isPending, id, onStateChange }: Props) {
  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {onStateChange ? (
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => (
            <FormStateBridge state={state} onChange={onStateChange} />
          )}
        </form.Subscribe>
      ) : null}

      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value
              ? m.offline_checkin_campaign_name()
              : value.length > 200
                ? "Max 200 characters"
                : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>
              {m.offline_checkin_campaign_name()} *
            </Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={isPending}
            />
            {field.state.meta.errors.length > 0 ? (
              <p className="text-sm text-destructive">
                {field.state.meta.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>
              {m.offline_checkin_campaign_alias()}
            </Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.offline_checkin_campaign_key_placeholder()}
              disabled={isPending}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>
              {m.offline_checkin_campaign_description()}
            </Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
              disabled={isPending}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="bannerImage">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>
              {m.offline_checkin_banner_image()}
            </Label>
            <Input
              id={field.name}
              type="url"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.offline_checkin_webhook_url_placeholder()}
              disabled={isPending}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="mode">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.offline_checkin_mode()} *</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => {
                const next = v as OfflineCheckInMode
                field.handleChange(next)
                // Re-align completionRule.kind so the user doesn't end up
                // submitting a daily campaign with `{ kind: "all" }`.
                const ruleField = form.getFieldValue("completionRule")
                if (next === "daily" && ruleField.kind !== "daily_total") {
                  form.setFieldValue("completionRule", {
                    kind: "daily_total",
                    days: 3,
                  })
                } else if (
                  next === "collect" &&
                  ruleField.kind === "daily_total"
                ) {
                  form.setFieldValue("completionRule", { kind: "all" })
                }
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collect">
                  {m.offline_checkin_mode_collect()}
                </SelectItem>
                <SelectItem value="daily">
                  {m.offline_checkin_mode_daily()}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldHint>
              {field.state.value === "daily"
                ? m.offline_checkin_mode_hint_daily()
                : m.offline_checkin_mode_hint_collect()}
            </FieldHint>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.mode}>
        {(mode) => (
          <form.Field name="completionRule">
            {(field) => {
              const rule = field.state.value
              const ruleKind = rule.kind
              return (
                <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                  <div className="space-y-2">
                    <Label>{m.offline_checkin_completion_rule()} *</Label>
                    <Select
                      value={ruleKind}
                      onValueChange={(v) => {
                        const next = v as OfflineCheckInCompletionRule["kind"]
                        let nextRule: OfflineCheckInCompletionRule
                        if (next === "all") nextRule = { kind: "all" }
                        else if (next === "n_of_m")
                          nextRule = { kind: "n_of_m", n: 3 }
                        else nextRule = { kind: "daily_total", days: 3 }
                        field.handleChange(nextRule)
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {m.offline_checkin_completion_rule_all()}
                        </SelectItem>
                        <SelectItem value="n_of_m">
                          {m.offline_checkin_completion_rule_n_of_m()}
                        </SelectItem>
                        {mode === "daily" ? (
                          <SelectItem value="daily_total">
                            {m.offline_checkin_completion_rule_daily_total()}
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>

                  {rule.kind === "n_of_m" ? (
                    <div className="space-y-2">
                      <Label>{m.offline_checkin_completion_n()}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rule.n}
                        onChange={(e) =>
                          field.handleChange({
                            kind: "n_of_m",
                            n: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        disabled={isPending}
                        className="w-32"
                      />
                    </div>
                  ) : null}

                  {rule.kind === "daily_total" ? (
                    <div className="space-y-2">
                      <Label>{m.offline_checkin_completion_days()}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rule.days}
                        onChange={(e) =>
                          field.handleChange({
                            kind: "daily_total",
                            days: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        disabled={isPending}
                        className="w-32"
                      />
                    </div>
                  ) : null}
                </div>
              )
            }}
          </form.Field>
        )}
      </form.Subscribe>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field name="startAt">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                {m.offline_checkin_start_at()}
              </Label>
              <Input
                id={field.name}
                type="datetime-local"
                value={
                  field.state.value
                    ? field.state.value.slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value
                  field.handleChange(v ? new Date(v).toISOString() : "")
                }}
                disabled={isPending}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="endAt">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.offline_checkin_end_at()}</Label>
              <Input
                id={field.name}
                type="datetime-local"
                value={
                  field.state.value
                    ? field.state.value.slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value
                  field.handleChange(v ? new Date(v).toISOString() : "")
                }}
                disabled={isPending}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="timezone">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.offline_checkin_timezone()}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v ?? "")}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Field name="collectionAlbumId">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>
              {m.offline_checkin_collection_album()}
            </Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.offline_checkin_album_id_placeholder()}
              disabled={isPending}
            />
            <FieldHint>
              {m.offline_checkin_collection_album_hint()}
            </FieldHint>
          </div>
        )}
      </form.Field>

      <form.Field name="completionRewards">
        {(field) => (
          <RewardEntryEditor
            label={m.offline_checkin_completion_rewards()}
            entries={field.state.value}
            onChange={(entries) => field.handleChange(entries)}
            hint={m.offline_checkin_completion_rewards_hint()}
            disabled={isPending}
          />
        )}
      </form.Field>
    </form>
  )
}
