import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

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
import { useCreateActivityTemplate } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type {
  ActivityTemplateRecurrence,
  CreateActivityTemplateInput,
} from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/activity/templates/create",
)({
  component: CreateActivityTemplatePage,
})

function CreateActivityTemplatePage() {
  const navigate = useNavigate()
  const mutation = useCreateActivityTemplate()

  const [alias, setAlias] = useState("weekly_challenge")
  const [name, setName] = useState<string>(m.activity_template_create_default_name())
  const [description, setDescription] = useState("")
  const [aliasPattern, setAliasPattern] = useState(
    "weekly_challenge_{year}_W{week}",
  )

  // duration
  const [teaseHours, setTeaseHours] = useState(24)
  const [activeDays, setActiveDays] = useState(7)
  const [rewardHours, setRewardHours] = useState(48)
  const [hiddenHours, setHiddenHours] = useState(168)

  // recurrence
  const [mode, setMode] = useState<"weekly" | "monthly" | "manual">("weekly")
  const [dayOfWeek, setDayOfWeek] = useState(1) // Mon
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [hourOfDay, setHourOfDay] = useState(0)
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )

  // payload
  const [payloadJson, setPayloadJson] = useState(
    JSON.stringify(
      {
        name: m.activity_template_create_default_name(),
        description: m.activity_template_create_default_description(),
        kind: "generic",
        timezone: "Asia/Shanghai",
        currency: {
          alias: "challenge_point",
          name: m.activity_template_create_default_currency_name(),
        },
        milestoneTiers: [
          {
            alias: "m1",
            points: 100,
            rewards: [{ type: "item", id: "gold-uuid", count: 1000 }],
          },
        ],
        globalRewards: [{ type: "item", id: "trophy-uuid", count: 1 }],
        visibility: "public",
        cleanupRule: { mode: "purge" },
      },
      null,
      2,
    ),
  )

  const [nodesBlueprintJson, setNodesBlueprintJson] = useState(
    JSON.stringify([], null, 2),
  )
  const [schedulesBlueprintJson, setSchedulesBlueprintJson] = useState(
    JSON.stringify([], null, 2),
  )
  const [autoPublish, setAutoPublish] = useState(true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let templatePayload: Record<string, unknown> = {}
    try {
      templatePayload = JSON.parse(payloadJson)
    } catch {
      toast.error(m.activity_template_create_payload_invalid())
      return
    }

    let nodesBlueprint: CreateActivityTemplateInput["nodesBlueprint"] = []
    let schedulesBlueprint: CreateActivityTemplateInput["schedulesBlueprint"] =
      []
    try {
      nodesBlueprint = JSON.parse(nodesBlueprintJson)
    } catch {
      toast.error(m.activity_template_create_nodes_invalid())
      return
    }
    try {
      schedulesBlueprint = JSON.parse(schedulesBlueprintJson)
    } catch {
      toast.error(m.activity_template_create_schedules_invalid())
      return
    }

    let recurrence: ActivityTemplateRecurrence
    if (mode === "weekly") {
      recurrence = { mode: "weekly", dayOfWeek, hourOfDay, timezone }
    } else if (mode === "monthly") {
      recurrence = { mode: "monthly", dayOfMonth, hourOfDay, timezone }
    } else {
      recurrence = { mode: "manual" }
    }

    const input: CreateActivityTemplateInput = {
      alias,
      name,
      description: description || null,
      templatePayload,
      durationSpec: {
        teaseSeconds: teaseHours * 3600,
        activeSeconds: activeDays * 86400,
        rewardSeconds: rewardHours * 3600,
        hiddenSeconds: hiddenHours * 3600,
      },
      recurrence,
      aliasPattern,
      nodesBlueprint,
      schedulesBlueprint,
      autoPublish,
    }

    try {
      await mutation.mutateAsync(input)
      toast.success(m.activity_template_create_success())
      navigate({ to: "/activity/templates" })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.activity_template_create_failed())
    }
  }

  return (
    <>
      <main className="flex-1 p-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{m.activity_template_create_field_alias()}</Label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value.toLowerCase())}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.activity_template_create_field_name()}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{m.common_description()}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_template_create_field_alias_pattern()}</Label>
            <Input
              value={aliasPattern}
              onChange={(e) => setAliasPattern(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_template_create_alias_pattern_hint({
                placeholders: "{year} {month} {day} {week} {ts}",
              })}
            </p>
          </div>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-2 text-sm font-medium">{m.activity_template_create_duration_legend()}</legend>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_template_create_field_tease_hours()}</Label>
                <Input
                  type="number"
                  min={0}
                  value={teaseHours}
                  onChange={(e) => setTeaseHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_template_create_field_active_days()}</Label>
                <Input
                  type="number"
                  min={1}
                  value={activeDays}
                  onChange={(e) => setActiveDays(Number(e.target.value) || 1)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_template_create_field_reward_hours()}</Label>
                <Input
                  type="number"
                  min={0}
                  value={rewardHours}
                  onChange={(e) => setRewardHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_template_create_field_hidden_hours()}</Label>
                <Input
                  type="number"
                  min={0}
                  value={hiddenHours}
                  onChange={(e) => setHiddenHours(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-2 text-sm font-medium">{m.activity_template_create_recurrence_legend()}</legend>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_template_create_field_recurrence_mode()}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as typeof mode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{m.activity_template_create_recurrence_weekly()}</SelectItem>
                    <SelectItem value="monthly">{m.activity_template_create_recurrence_monthly()}</SelectItem>
                    <SelectItem value="manual">{m.activity_template_create_recurrence_manual()}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "weekly" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_day_of_week()}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={6}
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_hour_of_day()}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={hourOfDay}
                      onChange={(e) => setHourOfDay(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_timezone()}</Label>
                    <Input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              {mode === "monthly" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_day_of_month()}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_hour_of_day()}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={hourOfDay}
                      onChange={(e) => setHourOfDay(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{m.activity_template_create_field_timezone()}</Label>
                    <Input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_template_create_field_payload()}</Label>
            <Textarea
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_template_create_payload_hint()}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_template_create_field_nodes_blueprint()}</Label>
            <Textarea
              value={nodesBlueprintJson}
              onChange={(e) => setNodesBlueprintJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder='[{"alias":"daily_checkin","nodeType":"check_in","refIdStrategy":"fixed","fixedRefId":"<uuid>","orderIndex":0}]'
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_template_create_nodes_hint_intro()}<code className="mx-1 rounded bg-muted px-1">refIdStrategy</code>:
              {" "}
              <code className="rounded bg-muted px-1">fixed</code>{m.activity_template_create_nodes_hint_fixed()}
              <code className="rounded bg-muted px-1">omit</code>{m.activity_template_create_nodes_hint_omit()}
              <code className="rounded bg-muted px-1">link_only</code>{m.activity_template_create_nodes_hint_link_only()}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_template_create_field_schedules_blueprint()}</Label>
            <Textarea
              value={schedulesBlueprintJson}
              onChange={(e) => setSchedulesBlueprintJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"alias":"mid_alert","triggerKind":"once_at","fireAtOffsetSeconds":43200,"actionType":"broadcast_mail","actionConfig":{"title":"...","content":"..."}}]'
            />
            <p className="text-xs text-muted-foreground">
              <code className="mx-1 rounded bg-muted px-1">fireAtOffsetSeconds</code>{m.activity_template_create_schedules_hint()}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              id="autoPublish"
              checked={autoPublish}
              onChange={(e) => setAutoPublish(e.target.checked)}
            />
            <Label htmlFor="autoPublish" className="cursor-pointer">
              {m.activity_template_create_auto_publish_label()}
            </Label>
            <span className="text-xs text-muted-foreground ml-auto">
              {m.activity_template_create_auto_publish_hint()}
            </span>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? m.activity_submitting() : m.activity_template_create_submit()}
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
