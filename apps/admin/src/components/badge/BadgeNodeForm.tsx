import { useState } from "react"

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
  type BadgeNode,
  type BadgeSignalMatchMode,
  type CreateBadgeNodeInput,
} from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

type Props = {
  initial?: BadgeNode
  onSubmit: (input: CreateBadgeNodeInput) => void | Promise<void>
  isPending?: boolean
  submitLabel: string
  existingKeys?: string[] // For parent picker
}

const NO_PARENT = "__none__"

export function BadgeNodeForm({
  initial,
  onSubmit,
  isPending,
  submitLabel,
  existingKeys = [],
}: Props) {
  const [key, setKey] = useState(initial?.key ?? "")
  const [parentKey, setParentKey] = useState<string | null>(
    initial?.parentKey ?? null,
  )
  const [displayType, setDisplayType] = useState<BadgeDisplayType>(
    (initial?.displayType as BadgeDisplayType) ?? "dot",
  )
  const [displayLabelKey, setDisplayLabelKey] = useState(
    initial?.displayLabelKey ?? "",
  )
  const [signalMatchMode, setSignalMatchMode] =
    useState<BadgeSignalMatchMode>(
      (initial?.signalMatchMode as BadgeSignalMatchMode) ?? "none",
    )
  const [signalKey, setSignalKey] = useState(initial?.signalKey ?? "")
  const [signalKeyPrefix, setSignalKeyPrefix] = useState(
    initial?.signalKeyPrefix ?? "",
  )
  const [aggregation, setAggregation] = useState<BadgeAggregation>(
    (initial?.aggregation as BadgeAggregation) ?? "none",
  )
  const [dismissMode, setDismissMode] = useState<BadgeDismissMode>(
    (initial?.dismissMode as BadgeDismissMode) ?? "auto",
  )
  const [dismissConfigJson, setDismissConfigJson] = useState(
    initial?.dismissConfig
      ? JSON.stringify(initial.dismissConfig, null, 2)
      : "",
  )
  const [visibilityRuleJson, setVisibilityRuleJson] = useState(
    initial?.visibilityRule
      ? JSON.stringify(initial.visibilityRule, null, 2)
      : "",
  )
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0)
  const [isEnabled, setIsEnabled] = useState<boolean>(
    initial?.isEnabled ?? true,
  )
  const [jsonError, setJsonError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let dismissConfig: Record<string, unknown> | null = null
    let visibilityRule: Record<string, unknown> | null = null
    try {
      dismissConfig = dismissConfigJson.trim()
        ? JSON.parse(dismissConfigJson)
        : null
      visibilityRule = visibilityRuleJson.trim()
        ? JSON.parse(visibilityRuleJson)
        : null
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON")
      return
    }
    setJsonError(null)

    await onSubmit({
      key: key.trim(),
      parentKey,
      displayType,
      displayLabelKey: displayLabelKey.trim() || null,
      signalMatchMode,
      signalKey:
        signalMatchMode === "exact" && signalKey.trim() ? signalKey.trim() : null,
      signalKeyPrefix:
        signalMatchMode === "prefix" && signalKeyPrefix.trim()
          ? signalKeyPrefix.trim()
          : null,
      aggregation,
      dismissMode,
      dismissConfig,
      visibilityRule,
      sortOrder,
      isEnabled,
    })
  }

  const parentOptions = existingKeys.filter((k) => k !== initial?.key)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: where does this badge appear? */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_step1_title()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.badge_step1_hint()}
          </p>
        </header>

        <div className="space-y-1">
          <Label htmlFor="key">{m.badge_field_key()} *</Label>
          <Input
            id="key"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="home.mail.inbox"
            disabled={!!initial}
            className="font-mono"
          />
          <FieldDescription>{m.badge_field_key_hint()}</FieldDescription>
        </div>

        <div className="space-y-1">
          <Label>{m.badge_field_parent()}</Label>
          <Select
            value={parentKey ?? NO_PARENT}
            onValueChange={(v) => setParentKey(v === NO_PARENT ? null : v)}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{m.badge_field_display_type()} *</Label>
            <Select
              value={displayType}
              onValueChange={(v) => setDisplayType(v as BadgeDisplayType)}
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

          <div className="space-y-1">
            <Label htmlFor="labelKey">{m.badge_field_label_key()}</Label>
            <Input
              id="labelKey"
              value={displayLabelKey}
              onChange={(e) => setDisplayLabelKey(e.target.value)}
              placeholder="nav.mail"
            />
          </div>
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

        <div className="space-y-1">
          <Label>{m.badge_field_match_mode()} *</Label>
          <Select
            value={signalMatchMode}
            onValueChange={(v) =>
              setSignalMatchMode(v as BadgeSignalMatchMode)
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

        {signalMatchMode === "exact" ? (
          <div className="space-y-1">
            <Label htmlFor="signalKey">{m.badge_field_signal_key()} *</Label>
            <Input
              id="signalKey"
              required
              value={signalKey}
              onChange={(e) => setSignalKey(e.target.value)}
              placeholder="mail.rewards.total"
              className="font-mono"
            />
          </div>
        ) : null}

        {signalMatchMode === "prefix" ? (
          <div className="space-y-1">
            <Label htmlFor="signalKeyPrefix" className="inline-flex items-center gap-1.5">
              {m.badge_field_signal_key_prefix()} *
              <FieldHint>{m.badge_field_signal_key_prefix_hint()}</FieldHint>
            </Label>
            <Input
              id="signalKeyPrefix"
              required
              value={signalKeyPrefix}
              onChange={(e) => setSignalKeyPrefix(e.target.value)}
              placeholder="mail.inbox."
              className="font-mono"
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label>{m.badge_field_aggregation()}</Label>
          <Select
            value={aggregation}
            onValueChange={(v) => setAggregation(v as BadgeAggregation)}
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
      </section>

      {/* Step 3: when does it go dark? */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_step3_title()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.badge_step3_hint()}
          </p>
        </header>

        <div className="space-y-1">
          <Label className="inline-flex items-center gap-1.5">
            {m.badge_field_dismiss_mode()} *
            <FieldHint>{m.badge_field_dismiss_mode_hint()}</FieldHint>
          </Label>
          <Select
            value={dismissMode}
            onValueChange={(v) => setDismissMode(v as BadgeDismissMode)}
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

        {(dismissMode === "cooldown" || dismissMode === "daily") && (
          <div className="space-y-1">
            <Label htmlFor="dismissConfig">
              {m.badge_field_dismiss_config()}
            </Label>
            <Textarea
              id="dismissConfig"
              rows={3}
              value={dismissConfigJson}
              onChange={(e) => setDismissConfigJson(e.target.value)}
              placeholder={
                dismissMode === "cooldown"
                  ? '{ "cooldownSec": 3600 }'
                  : '{ "periodType": "daily", "timezone": "Asia/Shanghai" }'
              }
              className="font-mono text-xs"
            />
          </div>
        )}
      </section>

      {/* Advanced: visibility / sort / enabled */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold">{m.badge_advanced_title()}</h2>
        </header>

        <div className="space-y-1">
          <Label htmlFor="visibilityRule" className="inline-flex items-center gap-1.5">
            {m.badge_field_visibility_rule()}
            <FieldHint>{m.badge_field_visibility_rule_hint()}</FieldHint>
          </Label>
          <Textarea
            id="visibilityRule"
            rows={3}
            value={visibilityRuleJson}
            onChange={(e) => setVisibilityRuleJson(e.target.value)}
            placeholder='{ "roles": ["vip"], "minLevel": 10 }'
            className="font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sortOrder">{m.badge_field_sort_order()}</Label>
            <Input
              id="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3">
            <Label htmlFor="enabled" className="cursor-pointer">
              {m.badge_field_enabled()}
            </Label>
            <Switch
              id="enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
        </div>
      </section>

      {jsonError ? (
        <p className="text-sm text-destructive">
          {m.badge_invalid_json()}: {jsonError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !key.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
