import { Button } from "#/components/ui/button"
import { FieldDescription, FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { RedDot, type RedDotDisplayType } from "#/components/ui/red-dot"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import {
  BADGE_AGGREGATIONS,
  BADGE_DISMISS_MODES,
  BADGE_DISPLAY_TYPES,
  BADGE_SIGNAL_MATCH_MODES,
  type BadgeAggregation,
  type BadgeDismissMode,
  type BadgeDisplayType,
  type BadgeSignalMatchMode,
} from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

import type { BadgeNodeFormApi } from "./use-node-form"

type Props = {
  /** Form instance owned by the caller — see `use-node-form.ts`. */
  form: BadgeNodeFormApi
  /** Lock `key` field in edit mode. The hook seeds it from `initial?.key`. */
  keyLocked?: boolean
  isPending?: boolean
  submitLabel: string
  /** Existing keys for parent picker; current node's key auto-excluded. */
  existingKeys?: string[]
}

const NO_PARENT = "__none__"

export function BadgeNodeForm({
  form,
  keyLocked,
  isPending,
  submitLabel,
  existingKeys = [],
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {/* Step 1: where does this badge appear? */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_step1_title()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.badge_step1_hint()}
          </p>
        </header>

        <form.Field name="key">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="key">{m.badge_field_key()} *</Label>
              <Input
                id="key"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="home.mail.inbox"
                disabled={keyLocked}
                className="font-mono"
              />
              <FieldDescription>{m.badge_field_key_hint()}</FieldDescription>
            </div>
          )}
        </form.Field>

        <form.Field name="parentKey">
          {(field) => {
            // Filter out current key (badge can't be its own parent).
            const parentOptions = existingKeys.filter(
              (k) => k !== form.state.values.key,
            )
            return (
              <div className="space-y-1">
                <Label>{m.badge_field_parent()}</Label>
                <Select
                  value={field.state.value ?? NO_PARENT}
                  onValueChange={(v) =>
                    field.handleChange(v === NO_PARENT ? null : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>{m.badge_parent_none()}</SelectItem>
                    {parentOptions.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          }}
        </form.Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <form.Field name="displayType">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.badge_field_display_type()} *</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as BadgeDisplayType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BADGE_DISPLAY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        <span className="inline-flex items-center gap-2">
                          <RedDot
                            displayType={t as RedDotDisplayType}
                            count={t === "number" ? 3 : 1}
                            forceVisible
                          />
                          {t}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="displayLabelKey">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="labelKey">{m.badge_field_label_key()}</Label>
                <Input
                  id="labelKey"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="nav.mail"
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      {/* Step 2: when does it light up? */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_step2_title()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.badge_step2_hint()}
          </p>
        </header>

        <form.Field name="signalMatchMode">
          {(field) => (
            <div className="space-y-1">
              <Label>{m.badge_field_match_mode()} *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) =>
                  field.handleChange(v as BadgeSignalMatchMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_SIGNAL_MATCH_MODES.map((mm) => (
                    <SelectItem key={mm} value={mm}>
                      {mm === "exact"
                        ? m.badge_match_exact()
                        : mm === "prefix"
                          ? m.badge_match_prefix()
                          : m.badge_match_none()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.signalMatchMode}>
          {(matchMode) =>
            matchMode === "exact" ? (
              <form.Field name="signalKey">
                {(field) => (
                  <div className="space-y-1">
                    <Label htmlFor="signalKey">{m.badge_field_signal_key()} *</Label>
                    <Input
                      id="signalKey"
                      required
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="mail.rewards.total"
                      className="font-mono"
                    />
                  </div>
                )}
              </form.Field>
            ) : matchMode === "prefix" ? (
              <form.Field name="signalKeyPrefix">
                {(field) => (
                  <div className="space-y-1">
                    <Label htmlFor="signalKeyPrefix" className="inline-flex items-center gap-1.5">
                      {m.badge_field_signal_key_prefix()} *
                      <FieldHint>{m.badge_field_signal_key_prefix_hint()}</FieldHint>
                    </Label>
                    <Input
                      id="signalKeyPrefix"
                      required
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="mail.inbox."
                      className="font-mono"
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>

        <form.Field name="aggregation">
          {(field) => (
            <div className="space-y-1">
              <Label>{m.badge_field_aggregation()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as BadgeAggregation)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_AGGREGATIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </section>

      {/* Step 3: when does it go dark? */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_step3_title()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.badge_step3_hint()}
          </p>
        </header>

        <form.Field name="dismissMode">
          {(field) => (
            <div className="space-y-1">
              <Label className="inline-flex items-center gap-1.5">
                {m.badge_field_dismiss_mode()} *
                <FieldHint>{m.badge_field_dismiss_mode_hint()}</FieldHint>
              </Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as BadgeDismissMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_DISMISS_MODES.map((dm) => (
                    <SelectItem key={dm} value={dm}>
                      {dm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.dismissMode}>
          {(dm) =>
            dm === "cooldown" || dm === "daily" ? (
              <form.Field name="dismissConfigJson">
                {(field) => (
                  <div className="space-y-1">
                    <Label htmlFor="dismissConfig">
                      {m.badge_field_dismiss_config()}
                    </Label>
                    <Textarea
                      id="dismissConfig"
                      rows={3}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={
                        dm === "cooldown"
                          ? '{ "cooldownSec": 3600 }'
                          : '{ "periodType": "daily", "timezone": "Asia/Shanghai" }'
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </section>

      {/* Advanced: visibility / sort / enabled */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_advanced_title()}</h2>
        </header>

        <form.Field name="visibilityRuleJson">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="visibilityRule" className="inline-flex items-center gap-1.5">
                {m.badge_field_visibility_rule()}
                <FieldHint>{m.badge_field_visibility_rule_hint()}</FieldHint>
              </Label>
              <Textarea
                id="visibilityRule"
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder='{ "roles": ["vip"], "minLevel": 10 }'
                className="font-mono text-xs"
              />
            </div>
          )}
        </form.Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <form.Field name="sortOrder">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="sortOrder">{m.badge_field_sort_order()}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(Number(e.target.value) || 0)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="isActive">
            {(field) => (
              <div className="flex items-center justify-between rounded-md border px-3">
                <Label htmlFor="enabled" className="cursor-pointer">
                  {m.badge_field_enabled()}
                </Label>
                <Switch
                  id="enabled"
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v === true)}
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      <form.Subscribe selector={(s) => s.values.jsonError}>
        {(jsonError) =>
          jsonError ? (
            <p className="text-sm text-destructive">
              {m.badge_invalid_json()}: {jsonError}
            </p>
          ) : null
        }
      </form.Subscribe>

      <div className="flex justify-end">
        <form.Subscribe selector={(s) => s.values.key}>
          {(key) => (
            <Button type="submit" disabled={isPending || !key.trim()}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
