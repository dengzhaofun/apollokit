import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Rocket, Trash2, Undo2, UserSearch } from "lucide-react"
import { toast } from "sonner"

import { ActivityForm } from "#/components/activity/ActivityForm"
import {
  STATE_LABELS,
  STATE_VARIANT,
} from "#/components/activity/ActivityTable"
import { NodeCreatorDialog } from "#/components/activity/NodeCreatorDialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Switch } from "#/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs"
import {
  useActivity,
  useActivityAnalytics,
  useActivityForUser,
  useActivityLifecycle,
  useActivityMembers,
  useActivityNodes,
  useActivitySchedules,
  useCreateActivityNode,
  useCreateActivitySchedule,
  useDeleteActivity,
  useDeleteActivityNode,
  useDeleteActivitySchedule,
  useLeaveActivity,
  useRedeemQueueNumber,
  useUpdateActivity,
  useUpdateActivityNode,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type {
  ActivityMemberStatus,
  CreateNodeInput,
  CreateScheduleInput,
} from "#/lib/types/activity"
import { useState } from "react"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { PageHeaderActions } from "#/components/PageHeader"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/activity/$alias/")({
  component: ActivityDetailPage,
})

function ActivityDetailPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { data: activity, isPending, error } = useActivity(alias)
  const updateMutation = useUpdateActivity()
  const deleteMutation = useDeleteActivity()
  const lifecycleMutation = useActivityLifecycle()

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !activity) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        {m.common_failed_to_load({
          resource: m.activity_page_title(),
          error: error?.message ?? m.common_unknown(),
        })}
      </div>
    )
  }

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity">
            <ArrowLeft className="size-4" />
            {m.common_back()}
          </Link>
        </Button>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {activity.alias}
        </code>
        <Badge variant={STATE_VARIANT[activity.status]} className="ml-2">
          {STATE_LABELS[activity.status] ? STATE_LABELS[activity.status]() : activity.status}
        </Badge>

        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/activity/$alias/users"
              params={{ alias }}
            >
              <UserSearch className="size-4" />
              {m.activity_detail_view_by_user()}
            </Link>
          </Button>
          {activity.status === "draft" ? (
            <Button
              size="sm"
              disabled={lifecycleMutation.isPending}
              onClick={async () => {
                try {
                  await lifecycleMutation.mutateAsync({
                    key: alias,
                    action: "publish",
                  })
                  toast.success(m.activity_detail_publish_success())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_detail_publish_failed())
                }
              }}
            >
              <Rocket className="size-4" />
              {m.activity_detail_publish()}
            </Button>
          ) : ["scheduled", "teasing"].includes(activity.status) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={lifecycleMutation.isPending}
              onClick={async () => {
                try {
                  await lifecycleMutation.mutateAsync({
                    key: alias,
                    action: "unpublish",
                  })
                  toast.success(m.activity_detail_unpublish_success())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_detail_unpublish_failed())
                }
              }}
            >
              <Undo2 className="size-4" />
              {m.activity_detail_unpublish()}
            </Button>
          ) : null}

          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (
                !confirm(
                  m.activity_detail_delete_confirm({ name: activity.name }),
                )
              )
                return
              try {
                await deleteMutation.mutateAsync(activity.id)
                toast.success(m.activity_detail_delete_success())
                navigate({ to: "/activity" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.activity_detail_delete_failed())
              }
            }}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <Tabs defaultValue="overview" className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger value="overview">{m.activity_tab_overview()}</TabsTrigger>
            <TabsTrigger value="edit">{m.activity_tab_edit()}</TabsTrigger>
            <TabsTrigger value="nodes">{m.activity_tab_nodes()}</TabsTrigger>
            <TabsTrigger value="schedules">{m.activity_tab_schedules()}</TabsTrigger>
            <TabsTrigger value="members">{m.activity_tab_members()}</TabsTrigger>
            <TabsTrigger value="analytics">{m.activity_tab_analytics()}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewPanel activity={activity} />
          </TabsContent>

          <TabsContent value="edit" className="mt-4">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <ActivityForm
                defaultValues={activity}
                disableAliasEdit
                isPending={updateMutation.isPending}
                submitLabel={m.activity_detail_save_label()}
                onSubmit={async (values) => {
                  try {
                    const { alias: _alias, ...patch } = values
                    void _alias
                    await updateMutation.mutateAsync({
                      id: activity.id,
                      ...patch,
                    })
                    toast.success(m.activity_detail_save_success())
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.activity_detail_save_failed())
                  }
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="nodes" className="mt-4">
            <NodesPanel activityKey={alias} activityId={activity.id} />
          </TabsContent>

          <TabsContent value="schedules" className="mt-4">
            <SchedulesPanel activityKey={alias} />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersPanel
              activityKey={alias}
              queueEnabled={!!activity.membership?.queue?.enabled}
              leaveAllowed={activity.membership?.leaveAllowed !== false}
            />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <AnalyticsPanel activityKey={alias} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}

function OverviewPanel({
  activity,
}: {
  activity: import("#/lib/types/activity").Activity
}) {
  const fmt = (iso: string) =>
    format(new Date(iso), "yyyy-MM-dd HH:mm:ss")
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">{m.activity_overview_timeline()}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">visibleAt: </span>
            {fmt(activity.visibleAt)}
          </div>
          <div>
            <span className="text-muted-foreground">startAt: </span>
            {fmt(activity.startAt)}
          </div>
          <div>
            <span className="text-muted-foreground">endAt: </span>
            {fmt(activity.endAt)}
          </div>
          <div>
            <span className="text-muted-foreground">rewardEndAt: </span>
            {fmt(activity.rewardEndAt)}
          </div>
          <div>
            <span className="text-muted-foreground">hiddenAt: </span>
            {fmt(activity.hiddenAt)}
          </div>
          <div>
            <span className="text-muted-foreground">timezone: </span>
            <code className="rounded bg-muted px-1 text-xs">
              {activity.timezone}
            </code>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">{m.activity_overview_rewards()}</h2>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">{m.activity_overview_milestones()}</div>
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(activity.milestoneTiers, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">{m.activity_overview_global_rewards()}</div>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(activity.globalRewards, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">{m.activity_overview_cleanup_strategy()}</div>
            <Badge variant="outline" className="mt-1">
              {activity.cleanupRule.mode}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

function NodesPanel({
  activityKey,
  activityId,
}: {
  activityKey: string
  activityId: string
}) {
  const { data: nodes, isPending } = useActivityNodes(activityKey)
  const createMutation = useCreateActivityNode(activityKey)
  const deleteMutation = useDeleteActivityNode(activityKey)
  const updateMutation = useUpdateActivityNode(activityKey)
  // The aggregated-view endpoint already computes
  // `effectiveEnabled = node.enabled && resource.isActive` for each
  // node. Query it with a synthetic endUserId so admins see the same
  // truth the player will see, without having to pick a real user.
  // Only the `nodes` field is read — player progress is ignored.
  const { data: aggregated } = useActivityForUser(activityKey, "__admin__")
  const resourceState = new Map<
    string,
    { resourceActive: boolean; effectiveEnabled: boolean }
  >()
  for (const n of aggregated?.nodes ?? []) {
    resourceState.set(n.node.id, {
      resourceActive: n.resourceActive,
      effectiveEnabled: n.effectiveEnabled,
    })
  }
  const [form, setForm] = useState<CreateNodeInput>({
    alias: "",
    nodeType: "task_group",
    refId: null,
    orderIndex: 0,
  })
  const [creatorOpen, setCreatorOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <NodeCreatorDialog
        activityKey={activityKey}
        activityId={activityId}
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreatorOpen(true)}>
          {m.activity_nodes_create_button()}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">
          {m.activity_nodes_attach_existing_title()}
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{m.common_alias()}</Label>
            <Input
              value={form.alias}
              onChange={(e) =>
                setForm((s) => ({ ...s, alias: e.target.value.toLowerCase() }))
              }
              placeholder="day_tasks"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.common_type()}</Label>
            <Select
              value={form.nodeType}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, nodeType: v as CreateNodeInput["nodeType"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check_in">{m.activity_nodes_select_check_in()}</SelectItem>
                <SelectItem value="task_group">{m.activity_nodes_select_task_group()}</SelectItem>
                <SelectItem value="exchange">{m.activity_nodes_select_exchange()}</SelectItem>
                <SelectItem value="leaderboard">{m.activity_nodes_select_leaderboard()}</SelectItem>
                <SelectItem value="lottery">{m.activity_nodes_select_lottery()}</SelectItem>
                <SelectItem value="banner">{m.activity_nodes_select_banner()}</SelectItem>
                <SelectItem value="game_board">{m.activity_nodes_select_game_board()}</SelectItem>
                <SelectItem value="custom">{m.activity_nodes_select_custom()}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_nodes_field_ref_id()}</Label>
            <Input
              value={form.refId ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, refId: e.target.value || null }))
              }
              placeholder="check_in_configs.id …"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.common_sort_order()}</Label>
            <Input
              type="number"
              value={form.orderIndex ?? 0}
              onChange={(e) =>
                setForm((s) => ({ ...s, orderIndex: Number(e.target.value) }))
              }
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={createMutation.isPending || !form.alias}
            onClick={async () => {
              try {
                await createMutation.mutateAsync(form)
                toast.success(m.activity_nodes_create_success())
                setForm({
                  alias: "",
                  nodeType: form.nodeType,
                  refId: null,
                  orderIndex: (form.orderIndex ?? 0) + 1,
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.activity_nodes_create_failed())
              }
            }}
          >
            {m.common_add()}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">{m.activity_nodes_configured_title()}</h3>
        {isPending ? (
          <div className="text-muted-foreground">{m.common_loading()}</div>
        ) : !nodes || nodes.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            {m.activity_nodes_empty()}
          </div>
        ) : (
          <>
          <div className="mb-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong>{m.activity_nodes_two_layer_title()}</strong>
            <ul className="ml-5 mt-1 list-disc space-y-0.5">
              <li>
                <strong>{m.activity_nodes_two_layer_node_term()}</strong>：
                {m.activity_nodes_two_layer_node_desc()}
              </li>
              <li>
                <strong>{m.activity_nodes_two_layer_resource_term()}</strong>：
                {m.activity_nodes_two_layer_resource_desc()}
              </li>
              <li>
                <strong>{m.activity_nodes_two_layer_visible_term()}</strong>{" "}
                {m.activity_nodes_two_layer_visible_desc()}
              </li>
            </ul>
          </div>
          <ul className="flex flex-col gap-2">
            {nodes.map((n) => {
              const rs = resourceState.get(n.id)
              const effectiveEnabled = rs
                ? rs.effectiveEnabled
                : n.enabled && !n.refId
              const resourceActive = rs ? rs.resourceActive : !n.refId
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {n.alias}
                  </code>
                  <Badge variant="outline">{n.nodeType}</Badge>
                  <span className="text-muted-foreground">
                    order: {n.orderIndex}
                  </span>
                  {n.refId ? (
                    <span className="text-xs text-muted-foreground">
                      ref: {n.refId.slice(0, 8)}…
                    </span>
                  ) : null}

                  <div className="ml-auto flex items-center gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            id={`node-enabled-${n.id}`}
                            checked={n.enabled}
                            disabled={updateMutation.isPending}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateMutation.mutateAsync({
                                  id: n.id,
                                  enabled: checked,
                                })
                              } catch (err) {
                                if (err instanceof ApiError)
                                  toast.error(err.body.error)
                                else toast.error(m.activity_nodes_toggle_failed())
                              }
                            }}
                          />
                          <label
                            htmlFor={`node-enabled-${n.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            {m.activity_nodes_switch_label()}
                          </label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {m.activity_nodes_switch_tooltip()}
                      </TooltipContent>
                    </Tooltip>

                    {n.refId ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant={resourceActive ? "default" : "outline"}
                          >
                            {resourceActive
                              ? m.activity_nodes_resource_active()
                              : m.activity_nodes_resource_inactive()}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {m.activity_nodes_resource_tooltip()}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={effectiveEnabled ? "default" : "destructive"}
                        >
                          {effectiveEnabled
                            ? m.activity_nodes_player_visible()
                            : m.activity_nodes_player_hidden()}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {m.activity_nodes_visibility_tooltip_intro()}
                        {!effectiveEnabled
                          ? !n.enabled && !resourceActive
                            ? m.activity_nodes_visibility_tooltip_both_off()
                            : !n.enabled
                              ? m.activity_nodes_visibility_tooltip_node_off()
                              : m.activity_nodes_visibility_tooltip_resource_off()
                          : ""}
                      </TooltipContent>
                    </Tooltip>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          !confirm(
                            m.activity_nodes_delete_confirm({ alias: n.alias }),
                          )
                        )
                          return
                        try {
                          await deleteMutation.mutateAsync(n.id)
                          toast.success(m.activity_nodes_delete_success())
                        } catch (err) {
                          if (err instanceof ApiError)
                            toast.error(err.body.error)
                          else toast.error(m.activity_nodes_delete_failed())
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          </>
        )}
      </div>
    </div>
  )
}

function SchedulesPanel({ activityKey }: { activityKey: string }) {
  const { data: schedules, isPending } = useActivitySchedules(activityKey)
  const createMutation = useCreateActivitySchedule(activityKey)
  const deleteMutation = useDeleteActivitySchedule(activityKey)
  const [form, setForm] = useState<CreateScheduleInput>({
    alias: "",
    triggerKind: "once_at",
    fireAt: null,
    offsetFrom: null,
    offsetSeconds: null,
    cronExpr: null,
    actionType: "emit_bus_event",
    actionConfig: {},
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">{m.activity_schedules_create_title()}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{m.common_alias()}</Label>
            <Input
              value={form.alias}
              onChange={(e) =>
                setForm((s) => ({ ...s, alias: e.target.value.toLowerCase() }))
              }
              placeholder="day3_boss"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>trigger</Label>
            <Select
              value={form.triggerKind}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, triggerKind: v as CreateScheduleInput["triggerKind"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once_at">{m.activity_schedules_trigger_once_at()}</SelectItem>
                <SelectItem value="relative_offset">
                  {m.activity_schedules_trigger_relative_offset()}
                </SelectItem>
                <SelectItem value="cron">{m.activity_schedules_trigger_cron()}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.triggerKind === "once_at" ? (
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>{m.activity_schedules_field_fire_at()}</Label>
              <Input
                type="datetime-local"
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    fireAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  }))
                }
              />
            </div>
          ) : null}
          {form.triggerKind === "relative_offset" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_schedules_field_offset_from()}</Label>
                <Select
                  value={form.offsetFrom ?? "start_at"}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, offsetFrom: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visible_at">visible_at</SelectItem>
                    <SelectItem value="start_at">start_at</SelectItem>
                    <SelectItem value="end_at">end_at</SelectItem>
                    <SelectItem value="reward_end_at">reward_end_at</SelectItem>
                    <SelectItem value="hidden_at">hidden_at</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{m.activity_schedules_field_offset_seconds()}</Label>
                <Input
                  type="number"
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      offsetSeconds: Number(e.target.value),
                    }))
                  }
                  placeholder="3600"
                />
              </div>
            </>
          ) : null}
          {form.triggerKind === "cron" ? (
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>{m.activity_schedules_field_cron_expr()}</Label>
              <Input
                value={form.cronExpr ?? ""}
                onChange={(e) =>
                  setForm((s) => ({ ...s, cronExpr: e.target.value || null }))
                }
                placeholder="0 12 * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {m.activity_schedules_cron_hint_prefix()}
                <code className="rounded bg-muted px-1">minute hour dom month dow</code>
                {m.activity_schedules_cron_hint_suffix()}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label>action</Label>
            <Select
              value={form.actionType}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, actionType: v as CreateScheduleInput["actionType"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="emit_bus_event">emit_bus_event</SelectItem>
                <SelectItem value="grant_reward">grant_reward</SelectItem>
                <SelectItem value="broadcast_mail">broadcast_mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>actionConfig (JSON)</Label>
            <Input
              value={JSON.stringify(form.actionConfig ?? {})}
              onChange={(e) => {
                try {
                  setForm((s) => ({
                    ...s,
                    actionConfig: JSON.parse(e.target.value),
                  }))
                } catch {
                  /* ignore */
                }
              }}
              placeholder='{"rewards":[...]} / {"endpointAlias":"my-wh"} / {"title":"xx","content":"yy"}'
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={createMutation.isPending || !form.alias}
            onClick={async () => {
              try {
                await createMutation.mutateAsync(form)
                toast.success(m.activity_schedules_create_success())
                setForm({ ...form, alias: "" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.activity_schedules_create_failed())
              }
            }}
          >
            {m.common_add()}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">{m.activity_schedules_configured_title()}</h3>
        {isPending ? (
          <div className="text-muted-foreground">{m.common_loading()}</div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            {m.activity_schedules_empty()}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {s.alias}
                </code>
                <Badge variant="outline">{s.triggerKind}</Badge>
                <Badge variant="secondary">{s.actionType}</Badge>
                {s.nextFireAt ? (
                  <span className="text-xs text-muted-foreground">
                    {m.activity_schedules_next_fire({
                      date: format(new Date(s.nextFireAt), "yyyy-MM-dd HH:mm"),
                    })}
                  </span>
                ) : null}
                {s.lastFiredAt ? (
                  <span className="text-xs text-muted-foreground">
                    {m.activity_schedules_last_fired({
                      status: s.lastStatus ?? "?",
                    })}
                  </span>
                ) : null}
                <Badge
                  variant={s.enabled ? "default" : "outline"}
                  className="ml-2"
                >
                  {s.enabled ? m.common_active() : m.common_inactive()}
                </Badge>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (
                        !confirm(
                          m.activity_schedules_delete_confirm({
                            alias: s.alias,
                          }),
                        )
                      )
                        return
                      try {
                        await deleteMutation.mutateAsync(s.id)
                        toast.success(m.activity_schedules_delete_success())
                      } catch (err) {
                        if (err instanceof ApiError)
                          toast.error(err.body.error)
                        else toast.error(m.activity_schedules_delete_failed())
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AnalyticsPanel({ activityKey }: { activityKey: string }) {
  const { data, isPending, error } = useActivityAnalytics(activityKey)

  if (isPending)
    return (
      <div className="rounded-xl border bg-card p-6 text-muted-foreground shadow-sm">
        {m.common_loading()}
      </div>
    )
  if (error)
    return (
      <div className="rounded-xl border bg-card p-6 text-destructive shadow-sm">
        {m.common_failed_to_load({
          resource: m.activity_tab_analytics(),
          error: error.message,
        })}
      </div>
    )
  if (!data) return null

  const totalBuckets = data.pointsBuckets.reduce((s, b) => s + b.count, 0) || 1
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={m.activity_analytics_participants()} value={data.participants.toLocaleString()} />
        <StatCard label={m.activity_analytics_completed()} value={data.completed.toLocaleString()} />
        <StatCard label={m.activity_analytics_dropped()} value={data.dropped.toLocaleString()} />
        <StatCard
          label={m.activity_analytics_avg_points()}
          value={Math.round(data.avgPoints).toLocaleString()}
        />
        <StatCard label={m.activity_analytics_p50_points()} value={data.p50Points.toLocaleString()} />
        <StatCard label={m.activity_analytics_max_points()} value={data.maxPoints.toLocaleString()} />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">{m.activity_analytics_points_distribution()}</h3>
        {data.pointsBuckets.length === 0 ? (
          <div className="text-muted-foreground">{m.activity_analytics_no_data()}</div>
        ) : (
          <div className="space-y-2">
            {data.pointsBuckets.map((b) => (
              <div key={b.bucket} className="flex items-center gap-3 text-sm">
                <code className="w-24 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {b.bucket}
                </code>
                <div className="relative h-5 flex-1 rounded bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-primary"
                    style={{
                      width: `${Math.max(1, (b.count / totalBuckets) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 text-right font-mono">
                  {b.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">{m.activity_analytics_milestone_claims()}</h3>
        {data.milestoneClaims.length === 0 ? (
          <div className="text-muted-foreground">{m.activity_analytics_no_claims()}</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.milestoneClaims
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((mc) => (
                <li
                  key={mc.milestoneAlias}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {mc.milestoneAlias}
                  </code>
                  <span className="ml-auto font-mono">
                    {m.activity_analytics_claim_count({
                      count: mc.count.toLocaleString(),
                    })}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function MembersPanel({
  activityKey,
  queueEnabled,
  leaveAllowed,
}: {
  activityKey: string
  queueEnabled: boolean
  leaveAllowed: boolean
}) {
  const [status, setStatus] = useState<ActivityMemberStatus | "all">("all")
  const { data, isPending, error } = useActivityMembers(activityKey, { status })
  const leaveMutation = useLeaveActivity(activityKey)
  const redeemMutation = useRedeemQueueNumber(activityKey)

  if (isPending) {
    return <div className="text-muted-foreground">{m.common_loading()}</div>
  }
  if (error) {
    const msg = error instanceof ApiError ? error.body.error : m.activity_members_load_failed()
    return <div className="text-destructive">{msg}</div>
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs">{m.activity_members_status_filter()}</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ActivityMemberStatus | "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.activity_members_status_all()}</SelectItem>
            <SelectItem value="joined">joined</SelectItem>
            <SelectItem value="completed">completed</SelectItem>
            <SelectItem value="left">left</SelectItem>
            <SelectItem value="dropped">dropped</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {m.activity_members_count_summary({ count: items.length })}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {m.activity_members_empty()}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">endUserId</th>
                <th className="px-3 py-2 text-left">{m.activity_members_col_joined_at()}</th>
                <th className="px-3 py-2 text-left">{m.common_status()}</th>
                <th className="px-3 py-2 text-left">{m.activity_members_col_queue_number()}</th>
                <th className="px-3 py-2 text-left">{m.activity_members_col_redeemed_at()}</th>
                <th className="px-3 py-2 text-right">{m.activity_members_col_points()}</th>
                <th className="px-3 py-2 text-right">{m.common_actions()}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((member) => (
                <tr key={member.endUserId} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{member.endUserId}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {format(new Date(member.joinedAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{member.status}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {member.queueNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {member.queueNumberUsedAt
                      ? format(new Date(member.queueNumberUsedAt), "yyyy-MM-dd HH:mm")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {member.activityPoints.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {queueEnabled &&
                        member.queueNumber &&
                        !member.queueNumberUsedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={redeemMutation.isPending}
                            onClick={async () => {
                              try {
                                await redeemMutation.mutateAsync(member.endUserId)
                                toast.success(
                                  m.activity_members_redeem_success({
                                    number: member.queueNumber ?? "",
                                  }),
                                )
                              } catch (err) {
                                if (err instanceof ApiError)
                                  toast.error(err.body.error)
                                else toast.error(m.activity_members_redeem_failed())
                              }
                            }}
                          >
                            {m.activity_members_redeem()}
                          </Button>
                        )}
                      {leaveAllowed && member.status === "joined" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={leaveMutation.isPending}
                          onClick={async () => {
                            if (
                              !confirm(
                                m.activity_members_leave_confirm({
                                  endUserId: member.endUserId,
                                }),
                              )
                            )
                              return
                            try {
                              await leaveMutation.mutateAsync(member.endUserId)
                              toast.success(m.activity_members_leave_success())
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error(m.activity_members_leave_failed())
                            }
                          }}
                        >
                          {m.activity_members_leave()}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
