import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import {
  ArrowLeft,
  CalendarRangeIcon,
  PartyPopperIcon,
  Pencil,
  Rocket,
  Trash2,
  Undo2,
  UserSearch,
} from "lucide-react"
import { toast } from "sonner"

import { ActivityForm } from "#/components/activity/ActivityForm"
import { ActivityPhaseBadge } from "#/components/activity/ActivityPhaseBadge"
import { ActivityAnalyticsPanel } from "#/components/analytics/ActivityAnalyticsPanel"
import { RefIdPicker } from "#/components/activity/RefIdPicker"
import {
  STATE_LABELS,
  STATE_VARIANT,
} from "#/components/activity/ActivityTable"
import { NodeCreatorDialog } from "#/components/activity/NodeCreatorDialog"
import { NodeEditDialog } from "#/components/activity/NodeEditDialog"
import {
  confirm,
  DetailHeader,
  ErrorState,
  PageBody,
  PageShell,
} from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Skeleton } from "#/components/ui/skeleton"
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
  ActivityNode,
  CreateNodeInput,
  CreateScheduleInput,
} from "#/lib/types/activity"
import { useEffect, useState, type ReactNode } from "react"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/activity/$alias/")({
  component: ActivityDetailPage,
})

function ActivityDetailPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { data: activity, isPending, error } = useActivity(alias)
  const updateMutation = useUpdateActivity()
  const deleteMutation = useDeleteActivity()
  const lifecycleMutation = useActivityLifecycle()
  const { orgSlug, projectSlug } = useTenantParams()

  if (isPending) {
    return (
      <PageShell>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    )
  }
  if (error || !activity) {
    return (
      <PageShell>
        <ErrorState
          title={m.activity_detail_load_failed_title()}
          description={m.activity_detail_load_failed_desc()}
          onRetry={() => window.location.reload()}
          retryLabel={m.common_retry()}
          error={error instanceof Error ? error : null}
        />
      </PageShell>
    )
  }

  // 详情页 actions —— 由 lifecycle 状态决定显示 publish / unpublish / 没有
  const lifecycleAction =
    activity.status === "draft" ? (
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
        <Rocket />
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
        <Undo2 />
        {m.activity_detail_unpublish()}
      </Button>
    ) : null

  // meta row —— 关键标识。当前 Activity 类型上能稳定可读的只有 createdAt;
  // 其他业务字段(type / 周期 / 节点数等)等 schema 稳定后再加。
  const meta: { icon: ReactNode; label: ReactNode; key?: ReactNode }[] = []
  if (activity.createdAt) {
    meta.push({
      icon: <CalendarRangeIcon />,
      label: format(new Date(activity.createdAt), "yyyy-MM-dd HH:mm"),
      key: m.activity_detail_meta_created(),
    })
  }

  return (
    <PageShell>
      <DetailHeader
        icon={<PartyPopperIcon className="size-6" />}
        title={activity.name}
        subtitle={activity.alias}
        status={
          <Badge variant={STATE_VARIANT[activity.status]}>
            {STATE_LABELS[activity.status] ? STATE_LABELS[activity.status]() : activity.status}
          </Badge>
        }
        meta={meta}
        actions={
          <>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/activity" params={{ orgSlug, projectSlug }}>
                  <ArrowLeft />
                  {m.common_back()}
                </Link>
              }
              variant="ghost" size="sm"
            />
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/activity/$alias/users" params={{ orgSlug, projectSlug, alias }}>
                  <UserSearch />
                  {m.activity_detail_view_by_user()}
                </Link>
              }
              variant="outline" size="sm"
            />
            {lifecycleAction}
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: m.activity_detail_delete_title(),
                  description: m.activity_detail_delete_confirm({ name: activity.name }),
                  confirmLabel: m.common_delete(),
                  danger: true,
                })
                if (!ok) return
                try {
                  await deleteMutation.mutateAsync(activity.id)
                  toast.success(m.activity_detail_delete_success())
                  navigate({ to: "/o/$orgSlug/p/$projectSlug/activity" , params: { orgSlug, projectSlug }})
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_detail_delete_failed())
                }
              }}
            >
              <Trash2 />
              {m.common_delete()}
            </Button>
          </>
        }
      />

      <PageBody>
        <Tabs defaultValue="overview">
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
                lockTimeEdit={activity.status !== "draft"}
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
            <ActivityAnalyticsPanel activityKey={alias} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </PageShell>
  )
}

/**
 * Picks the next time anchor relevant to the current phase and renders
 * a live "in 3d 4h" countdown. Refreshes every minute — the granularity
 * runtime cron already ticks at, so finer updates would be misleading.
 */
function ActivityCountdownCard({
  activity,
}: {
  activity: import("#/lib/types/activity").Activity
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const status = activity.status
  const v = new Date(activity.visibleAt).getTime()
  const s = new Date(activity.startAt).getTime()
  const e = new Date(activity.endAt).getTime()
  const h = new Date(activity.hiddenAt).getTime()
  const t = now.getTime()

  let target: number | null = null
  let labelKey: () => string = m.activity_countdown_to_visible
  if (status === "draft") {
    target = null
  } else if (t < v) {
    target = v
    labelKey = m.activity_countdown_to_visible
  } else if (t < s) {
    target = s
    labelKey = m.activity_countdown_to_active
  } else if (t < e) {
    target = e
    labelKey = m.activity_countdown_to_end
  } else if (t < h) {
    target = h
    labelKey = m.activity_countdown_to_archive
  }

  if (target === null) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
        <span className="text-muted-foreground">
          {m.activity_countdown_idle()}
        </span>
      </div>
    )
  }

  const remainMs = Math.max(0, target - t)
  const totalMin = Math.floor(remainMs / 60_000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60

  return (
    <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-card p-4 text-sm shadow-sm dark:from-amber-950/30">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {labelKey()}
        </span>
        <span className="font-mono text-base">
          {days > 0 ? `${days}d ` : ""}
          {hours > 0 || days > 0 ? `${hours}h ` : ""}
          {mins}m
        </span>
      </div>
    </div>
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
      <ActivityCountdownCard activity={activity} />

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
  const { data: nodesData, isPending } = useActivityNodes(activityKey)
  const nodes = nodesData?.items
  const activityPhase = nodesData?.activity.derivedPhase
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
  const [editNode, setEditNode] = useState<ActivityNode | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <NodeCreatorDialog
        activityKey={activityKey}
        activityId={activityId}
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
      />
      <NodeEditDialog
        key={editNode?.id ?? "none"}
        activityKey={activityKey}
        node={editNode}
        open={!!editNode}
        onOpenChange={(o) => {
          if (!o) setEditNode(null)
        }}
      />

      <div className="flex items-center justify-between gap-3">
        {activityPhase ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{m.activity_nodes_phase_banner()}</span>
            <ActivityPhaseBadge phase={activityPhase} />
          </div>
        ) : (
          <div />
        )}
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
              placeholder={m.activity_task_key_placeholder()}
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
                <SelectItem value="entity_blueprint">{m.activity_nodes_select_entity_blueprint()}</SelectItem>
                <SelectItem value="item_definition">{m.activity_nodes_select_item_definition()}</SelectItem>
                <SelectItem value="currency_definition">{m.activity_nodes_select_currency_definition()}</SelectItem>
                <SelectItem value="assist_pool">{m.activity_nodes_select_assist_pool()}</SelectItem>
                <SelectItem value="custom">{m.activity_nodes_select_custom()}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_nodes_field_ref_id()}</Label>
            <RefIdPicker
              nodeType={form.nodeType}
              value={form.refId ?? null}
              onChange={(v) => setForm((s) => ({ ...s, refId: v }))}
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
                      <TooltipTrigger
                        render={
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
                        }
                      />
                      <TooltipContent>
                        {m.activity_nodes_switch_tooltip()}
                      </TooltipContent>
                    </Tooltip>

                    {n.refId ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant={resourceActive ? "default" : "outline"}
                            >
                              {resourceActive
                                ? m.activity_nodes_resource_active()
                                : m.activity_nodes_resource_inactive()}
                            </Badge>
                          }
                        />
                        <TooltipContent>
                          {m.activity_nodes_resource_tooltip()}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge
                            variant={effectiveEnabled ? "default" : "destructive"}
                          >
                            {effectiveEnabled
                              ? m.activity_nodes_player_visible()
                              : m.activity_nodes_player_hidden()}
                          </Badge>
                        }
                      />
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

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditNode(n)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        {m.activity_nodes_edit_tooltip()}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const ok = await confirm({
                                title: m.activity_nodes_delete_title(),
                                description: m.activity_nodes_delete_confirm({ alias: n.alias }),
                                confirmLabel: m.common_delete(),
                                danger: true,
                              })
                              if (!ok) return
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
                        }
                      />
                      <TooltipContent>
                        {m.activity_nodes_delete_tooltip()}
                      </TooltipContent>
                    </Tooltip>
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
              placeholder={m.activity_milestone_key_placeholder()}
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
                  placeholder={m.activity_task_ttl_placeholder()}
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
                placeholder={m.activity_schedule_cron_placeholder()}
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
                      const ok = await confirm({
                        title: m.activity_schedules_delete_title(),
                        description: m.activity_schedules_delete_confirm({ alias: s.alias }),
                        confirmLabel: m.common_delete(),
                        danger: true,
                      })
                      if (!ok) return
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
                            const ok = await confirm({
                              title: m.activity_members_remove_title(),
                              description: m.activity_members_leave_confirm({ endUserId: member.endUserId }),
                              confirmLabel: m.activity_members_leave(),
                              danger: true,
                            })
                            if (!ok) return
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
