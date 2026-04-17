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
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Textarea } from "#/components/ui/textarea"
import { useCreateActivityTemplate } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type {
  ActivityTemplateRecurrence,
  CreateActivityTemplateInput,
} from "#/lib/types/activity"

export const Route = createFileRoute(
  "/_dashboard/activity/templates/create",
)({
  component: CreateActivityTemplatePage,
})

function CreateActivityTemplatePage() {
  const navigate = useNavigate()
  const mutation = useCreateActivityTemplate()

  const [alias, setAlias] = useState("weekly_challenge")
  const [name, setName] = useState("每周挑战")
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
        name: "每周挑战",
        description: "每周刷新的限时挑战活动",
        kind: "generic",
        timezone: "Asia/Shanghai",
        currency: { alias: "challenge_point", name: "挑战点" },
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
      toast.error("templatePayload JSON 解析失败")
      return
    }

    let nodesBlueprint: CreateActivityTemplateInput["nodesBlueprint"] = []
    let schedulesBlueprint: CreateActivityTemplateInput["schedulesBlueprint"] =
      []
    try {
      nodesBlueprint = JSON.parse(nodesBlueprintJson)
    } catch {
      toast.error("nodesBlueprint JSON 解析失败")
      return
    }
    try {
      schedulesBlueprint = JSON.parse(schedulesBlueprintJson)
    } catch {
      toast.error("schedulesBlueprint JSON 解析失败")
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
      toast.success("模板已创建")
      navigate({ to: "/activity/templates" })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error("创建失败")
    }
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">新建活动模板</h1>
      </header>

      <main className="flex-1 p-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>模板别名</Label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value.toLowerCase())}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>模板名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>活动 alias 生成模式</Label>
            <Input
              value={aliasPattern}
              onChange={(e) => setAliasPattern(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              支持 {"{year} {month} {day} {week} {ts}"} 占位符；展开后须在 org 内唯一。
            </p>
          </div>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-2 text-sm font-medium">活动时间段 (相对 startAt)</legend>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>预热小时 (tease)</Label>
                <Input
                  type="number"
                  min={0}
                  value={teaseHours}
                  onChange={(e) => setTeaseHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>进行天数 (active)</Label>
                <Input
                  type="number"
                  min={1}
                  value={activeDays}
                  onChange={(e) => setActiveDays(Number(e.target.value) || 1)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>领奖小时 (reward)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rewardHours}
                  onChange={(e) => setRewardHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>可见小时 (hidden 前)</Label>
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
            <legend className="px-2 text-sm font-medium">循环策略</legend>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>循环模式</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as typeof mode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">weekly 每周</SelectItem>
                    <SelectItem value="monthly">monthly 每月</SelectItem>
                    <SelectItem value="manual">manual 仅手动触发</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "weekly" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>每周第几天 (0=周日)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={6}
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>几点 (0-23)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={hourOfDay}
                      onChange={(e) => setHourOfDay(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>时区</Label>
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
                    <Label>每月第几天 (1-31)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>几点 (0-23)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={hourOfDay}
                      onChange={(e) => setHourOfDay(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>时区</Label>
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
            <Label>模板 payload (每次实例化复制到新活动的字段, JSON)</Label>
            <Textarea
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              支持字段: name / description / kind / timezone / currency /
              milestoneTiers / globalRewards / kindMetadata / cleanupRule /
              joinRequirement / visibility / themeColor / bannerImage / metadata
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>节点蓝图 nodesBlueprint (JSON 数组)</Label>
            <Textarea
              value={nodesBlueprintJson}
              onChange={(e) => setNodesBlueprintJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder='[{"alias":"daily_checkin","nodeType":"check_in","refIdStrategy":"fixed","fixedRefId":"<uuid>","orderIndex":0}]'
            />
            <p className="text-xs text-muted-foreground">
              每期活动会按此模板自动建节点。<code className="mx-1 rounded bg-muted px-1">refIdStrategy</code>:
              {" "}
              <code className="rounded bg-muted px-1">fixed</code> 共用同一 refId；
              <code className="rounded bg-muted px-1">omit</code> 虚拟节点无 refId；
              <code className="rounded bg-muted px-1">link_only</code> 留空等人工挂。
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>时间触发器蓝图 schedulesBlueprint (JSON 数组)</Label>
            <Textarea
              value={schedulesBlueprintJson}
              onChange={(e) => setSchedulesBlueprintJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"alias":"mid_alert","triggerKind":"once_at","fireAtOffsetSeconds":43200,"actionType":"broadcast_mail","actionConfig":{"title":"活动过半","content":"..."}}]'
            />
            <p className="text-xs text-muted-foreground">
              <code className="mx-1 rounded bg-muted px-1">fireAtOffsetSeconds</code>{" "}
              相对新一期 startAt 的秒偏移（once_at 用）。其他字段沿用 schedules 表意义。
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
              生成后自动发布 (跳过 draft 态)
            </Label>
            <span className="text-xs text-muted-foreground ml-auto">
              勾选后每期活动到点即进入时间态，不需要手动点发布。
            </span>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "提交中…" : "创建模板"}
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
