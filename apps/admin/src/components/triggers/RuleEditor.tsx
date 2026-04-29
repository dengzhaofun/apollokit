/**
 * Trigger 规则编辑器主组件 —— 同时被 /triggers/new 和 /triggers/$id 复用。
 *
 * 顶层布局:
 *   ┌────────────────────────────────────────────────────────┐
 *   │  Form fields (name / description / throttle)            │
 *   ├────────────────────────────────────────────────────────┤
 *   │  ReactFlow canvas (左) │ Side tabs (右)                  │
 *   │                       │  - Add action 按钮              │
 *   │                       │  - Dry-run 面板                 │
 *   │                       │  - Executions 列表 (仅编辑模式) │
 *   └────────────────────────────────────────────────────────┘
 */

import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useNavigate } from "@tanstack/react-router"
import { Gift, Lock, Mail, Maximize2, Minimize2, Plus, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { PageHeaderActions } from "#/components/PageHeader"
import { nodeTypes } from "#/components/triggers/nodes"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { Textarea } from "#/components/ui/textarea"
import { useEventCatalog } from "#/hooks/use-event-catalog"
import {
  useCreateTriggerRule,
  useDryRunTriggerRule,
  useTriggerExecutions,
  useUpdateTriggerRule,
} from "#/hooks/use-triggers"
import {
  buildConditionNode,
  buildDefaultCanvas,
  buildNewActionNode,
  deserializeRule,
  serializeCanvas,
  type TriggerCanvasNode,
} from "#/lib/triggers/graph-serializer"
import type {
  CatalogEventView,
  EventFieldRow,
} from "#/lib/types/event-catalog"
import type {
  TriggerAction,
  TriggerExecutionStatus,
  TriggerRule,
  TriggerThrottle,
} from "#/lib/types/triggers"
import * as m from "#/paraglide/messages.js"

export type RuleEditorProps = {
  /** 编辑现有规则;创建模式传 undefined。 */
  rule?: TriggerRule
}

export function RuleEditor({ rule }: RuleEditorProps) {
  const isNew = !rule
  const navigate = useNavigate()

  // ── form state ───────────────────────────────────────────────────
  const [name, setName] = useState(rule?.name ?? "")
  const [description, setDescription] = useState(rule?.description ?? "")
  const [throttle, setThrottle] = useState<TriggerThrottle>(
    rule?.throttle ?? {},
  )
  const [fullscreen, setFullscreen] = useState(false)
  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  // ── canvas state ─────────────────────────────────────────────────
  const initial = useMemo(() => {
    if (rule) return deserializeRule(rule)
    return buildDefaultCanvas()
  }, [rule])
  const [nodes, setNodes, onNodesChange] = useNodesState<TriggerCanvasNode>(
    initial.nodes,
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)

  // ── event-catalog (filter capability=trigger-rule) ───────────────
  const { data: events } = useEventCatalog({ capability: "trigger-rule" })

  // ── mutations ────────────────────────────────────────────────────
  const create = useCreateTriggerRule()
  const update = useUpdateTriggerRule()

  // ── canvas helpers ───────────────────────────────────────────────
  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((curr) =>
        curr.map((n) =>
          n.id === id
            ? ({
                ...n,
                data: { ...n.data, ...patch },
              } as TriggerCanvasNode)
            : n,
        ),
      )
    },
    [setNodes],
  )
  const deleteNode = useCallback(
    (id: string) => {
      // trigger 节点不可删
      if (id === "trigger") return
      setNodes((curr) => curr.filter((n) => n.id !== id))
      setEdges((curr) =>
        curr.filter((e) => e.source !== id && e.target !== id),
      )
    },
    [setNodes, setEdges],
  )
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...conn, id: `${conn.source}->${conn.target}` },
          eds,
        ),
      ),
    [setEdges],
  )

  // 把回调注入到每个 node.data 上,custom node 组件读取
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onUpdateData: updateNodeData,
          onDelete: deleteNode,
          ...(n.type === "trigger" ? { events: events ?? [] } : {}),
        },
      })) as unknown as TriggerCanvasNode[],
    [nodes, updateNodeData, deleteNode, events],
  )

  const addCondition = () => {
    if (nodes.some((n) => n.type === "condition")) return
    const cond = buildConditionNode(nodes)
    setNodes((curr) => [...curr, cond])
    // 自动连接最近的节点(trigger)→ condition
    const triggerNode = nodes.find((n) => n.type === "trigger")
    if (triggerNode) {
      setEdges((curr) => [
        ...curr,
        {
          id: `${triggerNode.id}->${cond.id}`,
          source: triggerNode.id,
          target: cond.id,
        },
      ])
    }
  }

  const addAction = (type: TriggerAction["type"]) => {
    let action: TriggerAction
    switch (type) {
      case "emit_event":
        action = { type: "emit_event", eventName: "", data: {} }
        break
      case "grant_reward":
        action = {
          type: "grant_reward",
          rewardKindKey: "",
          amount: 1,
          reason: "trigger",
        }
        break
      case "unlock_feature":
        action = { type: "unlock_feature", featureKey: "" }
        break
      case "send_notification":
        action = { type: "send_notification", templateKey: "" }
        break
    }
    const newNode = buildNewActionNode(nodes, action)
    setNodes((curr) => [...curr, newNode])
    // 自动连接到现有最后一个 action / condition / trigger
    const lastNonAction =
      [...nodes].sort((a, b) => b.position.y - a.position.y)[0]
    if (lastNonAction) {
      setEdges((curr) => [
        ...curr,
        {
          id: `${lastNonAction.id}->${newNode.id}`,
          source: lastNonAction.id,
          target: newNode.id,
        },
      ])
    }
  }

  // ── save handler ─────────────────────────────────────────────────
  const handleSave = async () => {
    const serialized = serializeCanvas(nodes, edges)
    if (!serialized.triggerEvent) {
      toast.error(m.triggers_editor_save_failed() + " missing trigger event")
      return
    }
    if (serialized.actions.length === 0) {
      toast.error(m.triggers_editor_save_failed() + " no actions configured")
      return
    }
    if (!name.trim()) {
      toast.error(m.triggers_editor_save_failed() + " missing name")
      return
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      triggerEvent: serialized.triggerEvent,
      condition: serialized.condition,
      actions: serialized.actions,
      throttle: cleanupThrottle(throttle),
      graph: serialized.graph,
    }

    try {
      if (isNew) {
        const created = await create.mutateAsync(payload)
        toast.success(m.triggers_editor_save_success())
        navigate({ to: "/triggers/$id", params: { id: created.id } })
      } else {
        await update.mutateAsync({
          id: rule.id,
          version: rule.version,
          ...payload,
        })
        toast.success(m.triggers_editor_save_success())
      }
    } catch (err) {
      toast.error(
        m.triggers_editor_save_failed() +
          " " +
          (err instanceof Error ? err.message : String(err)),
      )
    }
  }

  return (
    <main className="flex-1 flex flex-col p-6 gap-4 min-h-0">
      <PageHeaderActions>
        <Button variant="ghost" onClick={() => navigate({ to: "/triggers" })}>
          {m.triggers_editor_back()}
        </Button>
        <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
          {m.triggers_editor_save()}
        </Button>
      </PageHeaderActions>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m.triggers_editor_basic()}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{m.triggers_editor_name_label()}</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.triggers_editor_name_placeholder()}
            />
          </div>
          <div>
            <Label>{m.triggers_editor_throttle_label()}</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <ThrottleInput
                label={m.triggers_editor_throttle_per_user_minute()}
                value={throttle.perUserPerMinute}
                onChange={(v) =>
                  setThrottle({ ...throttle, perUserPerMinute: v })
                }
              />
              <ThrottleInput
                label={m.triggers_editor_throttle_per_user_hour()}
                value={throttle.perUserPerHour}
                onChange={(v) =>
                  setThrottle({ ...throttle, perUserPerHour: v })
                }
              />
              <ThrottleInput
                label={m.triggers_editor_throttle_per_org_minute()}
                value={throttle.perOrgPerMinute}
                onChange={(v) =>
                  setThrottle({ ...throttle, perOrgPerMinute: v })
                }
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>{m.triggers_editor_description_label()}</Label>
            <Textarea
              rows={2}
              className="mt-1"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={m.triggers_editor_description_placeholder()}
            />
          </div>
        </CardContent>
      </Card>

      <div
        className={
          fullscreen
            ? "fixed inset-0 z-50 bg-background p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4"
            : "flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 min-h-[600px]"
        }
      >
        <Card className="overflow-hidden flex flex-col min-h-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {m.triggers_editor_canvas()}
            </CardTitle>
            <div className="flex gap-2">
              {!nodes.some((n) => n.type === "condition") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCondition}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {m.triggers_node_condition()}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm">
                      <Plus className="mr-1 h-4 w-4" />
                      {m.triggers_node_add_action()}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => addAction("emit_event")}>
                    <Zap className="mr-2 h-3.5 w-3.5" />
                    {m.triggers_node_action_emit_event()}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => addAction("unlock_feature")}
                  >
                    <Lock className="mr-2 h-3.5 w-3.5" />
                    {m.triggers_node_action_unlock_feature()}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled
                    title={m.triggers_action_stub_notice()}
                  >
                    <Gift className="mr-2 h-3.5 w-3.5" />
                    {m.triggers_node_action_grant_reward()}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled
                    title={m.triggers_action_stub_notice()}
                  >
                    <Mail className="mr-2 h-3.5 w-3.5" />
                    {m.triggers_node_action_send_notification()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon-sm"
                variant="ghost"
                title={
                  fullscreen
                    ? m.triggers_editor_exit_fullscreen()
                    : m.triggers_editor_fullscreen()
                }
                onClick={() => setFullscreen((f) => !f)}
              >
                {fullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-[600px]">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodesWithCallbacks}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </ReactFlowProvider>
          </CardContent>
        </Card>

        <SidePanel rule={rule} nodes={nodes} edges={edges} />
      </div>
    </main>
  )
}

function ThrottleInput(props: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{props.label}</Label>
      <Input
        type="number"
        min={0}
        className="mt-1 text-sm"
        value={props.value ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim()
          if (!v) return props.onChange(undefined)
          const n = Number(v)
          props.onChange(Number.isFinite(n) && n > 0 ? n : undefined)
        }}
      />
    </div>
  )
}

function cleanupThrottle(t: TriggerThrottle): TriggerThrottle | null {
  const pruned: TriggerThrottle = {}
  if (t.perUserPerMinute) pruned.perUserPerMinute = t.perUserPerMinute
  if (t.perUserPerHour) pruned.perUserPerHour = t.perUserPerHour
  if (t.perUserPerDay) pruned.perUserPerDay = t.perUserPerDay
  if (t.perOrgPerMinute) pruned.perOrgPerMinute = t.perOrgPerMinute
  if (t.perOrgPerHour) pruned.perOrgPerHour = t.perOrgPerHour
  return Object.keys(pruned).length === 0 ? null : pruned
}

function SidePanel(props: {
  rule?: TriggerRule
  nodes: TriggerCanvasNode[]
  edges: Edge[]
}) {
  const [tab, setTab] = useState<"dryrun" | "executions">("dryrun")
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "dryrun" | "executions")}
      className="flex flex-col"
    >
      <TabsList>
        <TabsTrigger value="dryrun">
          {m.triggers_editor_dryrun_panel()}
        </TabsTrigger>
        {props.rule && (
          <TabsTrigger value="executions">
            {m.triggers_editor_executions()}
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="dryrun" className="flex-1 mt-2">
        <DryRunPanel rule={props.rule} nodes={props.nodes} />
      </TabsContent>
      {props.rule && (
        <TabsContent value="executions" className="flex-1 mt-2">
          <ExecutionsPanel ruleId={props.rule.id} />
        </TabsContent>
      )}
    </Tabs>
  )
}

function DryRunPanel(props: {
  rule?: TriggerRule
  nodes: TriggerCanvasNode[]
}) {
  const { data: events } = useEventCatalog({ capability: "trigger-rule" })
  const triggerNode = props.nodes.find((n) => n.type === "trigger")
  const eventName = triggerNode?.data.eventName as string | undefined
  const eventDef = events?.find((e) => e.name === eventName)

  const [payloadText, setPayloadText] = useState("")
  // 「针对哪个 eventName 填过 sample 了」—— 相同 eventName 下不再覆盖用户的手改。
  // 切事件、或 events catalog 第一次加载完成时自动填充。
  const filledFor = useRef<string | null>(null)
  useEffect(() => {
    if (events === undefined) return // catalog 还没加载,等下一轮
    if (filledFor.current === (eventName ?? "")) return
    filledFor.current = eventName ?? ""
    setPayloadText(
      JSON.stringify(
        buildSamplePayload(eventDef, props.rule?.organizationId),
        null,
        2,
      ),
    )
  }, [events, eventName, eventDef, props.rule?.organizationId])

  const dryRun = useDryRunTriggerRule()

  if (!props.rule) {
    return (
      <Card>
        <CardContent className="pt-4 space-y-3">
          {eventDef && <PayloadSchemaCard eventDef={eventDef} />}
          <p className="text-sm text-muted-foreground">
            先保存规则后才能试跑。
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {eventDef && <PayloadSchemaCard eventDef={eventDef} />}
        <div>
          <Label className="text-xs">
            {m.triggers_editor_dryrun_payload_label()}
          </Label>
          <Textarea
            rows={8}
            className="mt-1 font-mono text-xs"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={dryRun.isPending}
          onClick={() => {
            try {
              const payload = JSON.parse(payloadText)
              if (!props.rule) return
              dryRun.mutate({ id: props.rule.id, payload })
            } catch {
              toast.error("payload 不是合法 JSON")
            }
          }}
        >
          {m.triggers_editor_dryrun_run()}
        </Button>
        {dryRun.data && (
          <div className="rounded border bg-muted/50 p-2 text-xs">
            {dryRun.data.results.length === 0 ? (
              <p className="text-muted-foreground">
                {m.triggers_editor_dryrun_no_match()}
              </p>
            ) : (
              dryRun.data.results.map((r) => (
                <div key={r.ruleId} className="space-y-1">
                  <div>
                    <Badge variant="outline">{r.status}</Badge>{" "}
                    cond={String(r.conditionResult)}
                  </div>
                  <ul className="ml-4 list-disc">
                    {r.actionResults.map((ar, i) => (
                      <li key={i}>
                        <code>{ar.type}</code>: {ar.status}
                        {ar.error && ` (${ar.error})`}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ExecutionsPanel({ ruleId }: { ruleId: string }) {
  const { data: executions } = useTriggerExecutions({ ruleId, limit: 20 })
  if (!executions) {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          {m.common_loading()}
        </CardContent>
      </Card>
    )
  }
  if (executions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          (无执行记录)
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="pt-4 space-y-2 text-xs">
        {executions.map((ex) => (
          <div
            key={ex.id}
            className="flex justify-between border-b py-1 last:border-0"
          >
            <span>{new Date(ex.startedAt).toLocaleString()}</span>
            <Badge variant={statusBadgeVariant(ex.status)}>
              {ex.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function statusBadgeVariant(
  status: TriggerExecutionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "success") return "default"
  if (status === "failed") return "destructive"
  if (status === "throttled" || status === "condition_failed") return "outline"
  return "secondary"
}

/**
 * Payload schema 折叠卡片 —— 嵌在 Dry-run 面板顶部,跟选中事件联动。
 * 让用户配 condition / payload 时不用跳到 event-catalog 查字段。
 */
function PayloadSchemaCard({ eventDef }: { eventDef: CatalogEventView }) {
  const [collapsed, setCollapsed] = useState(false)
  if (eventDef.fields.length === 0) return null
  return (
    <div className="rounded border bg-muted/30">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:bg-muted/50"
      >
        <span>
          {m.triggers_event_payload_schema()}{" "}
          <code className="ml-1 normal-case font-mono text-foreground">
            {eventDef.name}
          </code>
        </span>
        <span className="text-base leading-none">{collapsed ? "+" : "−"}</span>
      </button>
      {!collapsed && (
        <>
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {eventDef.fields.map((f) => (
                <tr key={f.path} className="border-t">
                  <td className="px-2 py-1 align-top">
                    <span className="text-foreground">{f.path}</span>
                    {f.required && (
                      <span className="ml-1 text-destructive" title="required">
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground align-top">
                    {f.type}
                  </td>
                  {f.description && (
                    <td
                      className="px-2 py-1 text-muted-foreground align-top max-w-[160px] truncate"
                      title={f.description}
                    >
                      {f.description}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 border-t text-[10px] text-muted-foreground italic">
            {m.triggers_event_payload_hint()}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 根据事件 schema 自动生成 dry-run sample payload。
 *
 * - 每个字段按 type 给一个合理示例值
 * - organizationId 用当前 rule 的 orgId(已知);endUserId 给一个 demo 标识
 * - sample 应该让用户「看一眼就知道这是什么字段」,不是要做完美随机数据
 */
function buildSamplePayload(
  eventDef: CatalogEventView | undefined,
  orgId: string | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // 默认两个公共字段(几乎所有业务事件都有)
  out.organizationId = orgId ?? "<your-org-id>"
  out.endUserId = "demo-user"

  if (!eventDef) return out
  for (const field of eventDef.fields) {
    if (field.path === "organizationId" || field.path === "endUserId") continue
    if (!isTopLevelPath(field.path)) continue // 嵌套路径暂不展开,留 user 自己加
    out[field.path] = sampleValueForField(field)
  }
  return out
}

function isTopLevelPath(p: string): boolean {
  return !p.includes(".") && !p.includes("[")
}

function sampleValueForField(f: EventFieldRow): unknown {
  switch (f.type) {
    case "string":
      // 几个常见字段名给更直观的示例
      if (f.path.endsWith("Id")) return "demo-" + f.path.replace(/Id$/, "")
      if (f.path.endsWith("Alias")) return "demo-alias"
      if (f.path.endsWith("At")) return new Date().toISOString()
      return "demo"
    case "number":
      return 1
    case "boolean":
      return true
    case "array":
      return []
    case "object":
      return {}
    case "null":
      return null
    default:
      return ""
  }
}
