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
        加载中…
      </div>
    )
  }
  if (error || !activity) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        加载失败：{error?.message ?? "未知"}
      </div>
    )
  }

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity">
            <ArrowLeft className="size-4" />
            返回
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
              按玩家查看
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
                  toast.success("已发布，状态将按时间自动推进")
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error("发布失败")
                }
              }}
            >
              <Rocket className="size-4" />
              发布
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
                  toast.success("已回到草稿")
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error("下架失败")
                }
              }}
            >
              <Undo2 className="size-4" />
              撤回到草稿
            </Button>
          ) : null}

          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (!confirm(`确认删除活动 "${activity.name}"？此操作不可恢复。`))
                return
              try {
                await deleteMutation.mutateAsync(activity.id)
                toast.success("已删除")
                navigate({ to: "/activity" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("删除失败")
              }
            }}
          >
            <Trash2 className="size-4" />
            删除
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <Tabs defaultValue="overview" className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="nodes">节点</TabsTrigger>
            <TabsTrigger value="schedules">时间触发器</TabsTrigger>
            <TabsTrigger value="members">成员</TabsTrigger>
            <TabsTrigger value="analytics">数据</TabsTrigger>
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
                submitLabel="保存修改"
                onSubmit={async (values) => {
                  try {
                    const { alias: _alias, ...patch } = values
                    void _alias
                    await updateMutation.mutateAsync({
                      id: activity.id,
                      ...patch,
                    })
                    toast.success("已保存")
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error("保存失败")
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
        <h2 className="mb-3 text-sm font-semibold">时间轴</h2>
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
        <h2 className="mb-3 text-sm font-semibold">奖励配置</h2>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">里程碑</div>
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(activity.milestoneTiers, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">通关总奖励</div>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(activity.globalRewards, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">清理策略</div>
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
          🧩 新建并挂载子配置 (一站式)
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">
          仅挂载已有配置 (填 refId)
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>别名</Label>
            <Input
              value={form.alias}
              onChange={(e) =>
                setForm((s) => ({ ...s, alias: e.target.value.toLowerCase() }))
              }
              placeholder="day_tasks"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>类型</Label>
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
                <SelectItem value="check_in">check_in 签到</SelectItem>
                <SelectItem value="task_group">task_group 任务组</SelectItem>
                <SelectItem value="exchange">exchange 兑换商店</SelectItem>
                <SelectItem value="leaderboard">leaderboard 排行榜</SelectItem>
                <SelectItem value="lottery">lottery 抽奖池</SelectItem>
                <SelectItem value="banner">banner 轮播图</SelectItem>
                <SelectItem value="game_board">game_board 小游戏</SelectItem>
                <SelectItem value="entity_blueprint">entity_blueprint 实体蓝图</SelectItem>
                <SelectItem value="item_definition">item_definition 物品</SelectItem>
                <SelectItem value="currency_definition">currency_definition 货币</SelectItem>
                <SelectItem value="assist_pool">assist_pool 辅助池</SelectItem>
                <SelectItem value="custom">custom 自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>refId (可选)</Label>
            <Input
              value={form.refId ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, refId: e.target.value || null }))
              }
              placeholder="check_in_configs.id …"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>排序</Label>
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
                toast.success("节点已添加")
                setForm({
                  alias: "",
                  nodeType: form.nodeType,
                  refId: null,
                  orderIndex: (form.orderIndex ?? 0) + 1,
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("添加失败")
              }
            }}
          >
            添加
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">已配置节点</h3>
        {isPending ? (
          <div className="text-muted-foreground">加载中…</div>
        ) : !nodes || nodes.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            暂无节点
          </div>
        ) : (
          <>
          <div className="mb-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong>两层开关说明：</strong>
            <ul className="ml-5 mt-1 list-disc space-y-0.5">
              <li>
                <strong>节点启用 (activity_nodes.enabled)</strong>：
                本活动内的临时开关。关掉只藏这一处挂载，不影响底层资源。
              </li>
              <li>
                <strong>资源状态 (resource.isActive)</strong>：
                底层资源本身的全局开关。在资源自己的编辑页切换。
              </li>
              <li>
                <strong>对玩家可见</strong> = 节点启用 <em>且</em>{" "}
                资源状态 = true。任一关闭即隐藏。
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
                                else toast.error("切换失败")
                              }
                            }}
                          />
                          <label
                            htmlFor={`node-enabled-${n.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            节点
                          </label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        节点级开关：仅控制这个活动节点是否呈现，不改底层资源
                      </TooltipContent>
                    </Tooltip>

                    {n.refId ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant={resourceActive ? "default" : "outline"}
                          >
                            资源 {resourceActive ? "启用" : "停用"}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          底层资源 (resource.isActive) 的状态。到资源自己的编辑页切换。
                        </TooltipContent>
                      </Tooltip>
                    ) : null}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={effectiveEnabled ? "default" : "destructive"}
                        >
                          {effectiveEnabled ? "对玩家可见" : "对玩家隐藏"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        effectiveEnabled = 节点启用 AND 资源启用。
                        {!effectiveEnabled
                          ? !n.enabled && !resourceActive
                            ? " 当前两者均关闭。"
                            : !n.enabled
                              ? " 当前节点开关关闭。"
                              : " 当前底层资源 isActive=false。"
                          : ""}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`删除节点 ${n.alias}？`)) return
                            try {
                              await deleteMutation.mutateAsync(n.id)
                              toast.success("节点已删除")
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error("删除失败")
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        删除节点不会删除底层资源；资源仍保留在对应模块下
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
        <h3 className="mb-3 text-sm font-semibold">新增时间触发器</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>别名</Label>
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
                <SelectItem value="once_at">once_at 绝对时间</SelectItem>
                <SelectItem value="relative_offset">
                  relative_offset 相对活动
                </SelectItem>
                <SelectItem value="cron">cron 表达式 (循环)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.triggerKind === "once_at" ? (
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>fireAt (绝对时间)</Label>
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
                <Label>基准点</Label>
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
                <Label>偏移秒数 (正/负均可)</Label>
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
              <Label>cron 表达式 (按活动时区解释)</Label>
              <Input
                value={form.cronExpr ?? ""}
                onChange={(e) =>
                  setForm((s) => ({ ...s, cronExpr: e.target.value || null }))
                }
                placeholder="0 12 * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                5 段格式:{" "}
                <code className="rounded bg-muted px-1">minute hour dom month dow</code>
                。活动归档后自动停止。
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
                toast.success("触发器已添加")
                setForm({ ...form, alias: "" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("添加失败")
              }
            }}
          >
            添加
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">已配置触发器</h3>
        {isPending ? (
          <div className="text-muted-foreground">加载中…</div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            暂无触发器
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
                    下次: {format(new Date(s.nextFireAt), "yyyy-MM-dd HH:mm")}
                  </span>
                ) : null}
                {s.lastFiredAt ? (
                  <span className="text-xs text-muted-foreground">
                    已触发 · {s.lastStatus ?? "?"}
                  </span>
                ) : null}
                <Badge
                  variant={s.enabled ? "default" : "outline"}
                  className="ml-2"
                >
                  {s.enabled ? "启用" : "停用"}
                </Badge>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!confirm(`删除触发器 ${s.alias}？`)) return
                      try {
                        await deleteMutation.mutateAsync(s.id)
                        toast.success("已删除")
                      } catch (err) {
                        if (err instanceof ApiError)
                          toast.error(err.body.error)
                        else toast.error("删除失败")
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
        加载中…
      </div>
    )
  if (error)
    return (
      <div className="rounded-xl border bg-card p-6 text-destructive shadow-sm">
        加载失败：{error.message}
      </div>
    )
  if (!data) return null

  const totalBuckets = data.pointsBuckets.reduce((s, b) => s + b.count, 0) || 1
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="总参与人数" value={data.participants.toLocaleString()} />
        <StatCard label="已完成" value={data.completed.toLocaleString()} />
        <StatCard label="已流失" value={data.dropped.toLocaleString()} />
        <StatCard
          label="积分均值"
          value={Math.round(data.avgPoints).toLocaleString()}
        />
        <StatCard label="积分中位数" value={data.p50Points.toLocaleString()} />
        <StatCard label="积分最高" value={data.maxPoints.toLocaleString()} />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">积分分布</h3>
        {data.pointsBuckets.length === 0 ? (
          <div className="text-muted-foreground">无数据</div>
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
        <h3 className="mb-3 text-sm font-semibold">里程碑领取数</h3>
        {data.milestoneClaims.length === 0 ? (
          <div className="text-muted-foreground">暂无领取</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.milestoneClaims
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((m) => (
                <li
                  key={m.milestoneAlias}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {m.milestoneAlias}
                  </code>
                  <span className="ml-auto font-mono">
                    {m.count.toLocaleString()} 人领取
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
    return <div className="text-muted-foreground">加载中...</div>
  }
  if (error) {
    const msg = error instanceof ApiError ? error.body.error : "加载失败"
    return <div className="text-destructive">{msg}</div>
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs">状态过滤</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ActivityMemberStatus | "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="joined">joined</SelectItem>
            <SelectItem value="completed">completed</SelectItem>
            <SelectItem value="left">left</SelectItem>
            <SelectItem value="dropped">dropped</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length} 条
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          暂无成员
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">endUserId</th>
                <th className="px-3 py-2 text-left">加入时间</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-left">号码</th>
                <th className="px-3 py-2 text-left">核销时间</th>
                <th className="px-3 py-2 text-right">积分</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.endUserId} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{m.endUserId}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {format(new Date(m.joinedAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{m.status}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {m.queueNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {m.queueNumberUsedAt
                      ? format(new Date(m.queueNumberUsedAt), "yyyy-MM-dd HH:mm")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {m.activityPoints.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {queueEnabled &&
                        m.queueNumber &&
                        !m.queueNumberUsedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={redeemMutation.isPending}
                            onClick={async () => {
                              try {
                                await redeemMutation.mutateAsync(m.endUserId)
                                toast.success(`号码 ${m.queueNumber} 已核销`)
                              } catch (err) {
                                if (err instanceof ApiError)
                                  toast.error(err.body.error)
                                else toast.error("核销失败")
                              }
                            }}
                          >
                            核销
                          </Button>
                        )}
                      {leaveAllowed && m.status === "joined" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={leaveMutation.isPending}
                          onClick={async () => {
                            if (!confirm(`将 ${m.endUserId} 标记为离开？`))
                              return
                            try {
                              await leaveMutation.mutateAsync(m.endUserId)
                              toast.success("已标记离开")
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error("操作失败")
                            }
                          }}
                        >
                          离开
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
