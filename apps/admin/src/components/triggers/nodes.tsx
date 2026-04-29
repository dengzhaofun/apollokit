/**
 * Trigger 编辑器三种节点 —— xyflow custom node 实现。
 *
 * - TriggerNode: 唯一,起点。用 NativeSelect 让用户选 capability=trigger-rule 的事件。
 * - ConditionNode: 0 或 1 个,展示 JSONLogic 文本,简单 textarea。
 * - ActionNode: N 个,根据 action.type 渲染不同字段(MVP 只覆盖 dispatch_webhook + emit_event)。
 */

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Gift, Lock, Mail, Trash2, Zap } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import type {
  ActionNodeData,
  ConditionNodeData,
  TriggerNodeData,
} from "#/lib/triggers/graph-serializer"
import type { CatalogEventView } from "#/lib/types/event-catalog"
import * as m from "#/paraglide/messages.js"

/**
 * 节点回调通过 React.useContext 之外更简单的方式注入:
 * 编辑器里 ReactFlow 的 setNodes 直接操作节点 data,
 * 节点组件接收一个 `data` 对象上挂的 callback。
 */
export type NodeCallbacks = {
  onUpdateData?: (id: string, patch: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  /** 给 TriggerNode 用的事件列表(已按 capability 过滤)。 */
  events?: CatalogEventView[]
}

// ──────────────────────────────────────────────────────────────────────
// TriggerNode

export function TriggerNode(
  props: NodeProps & {
    data: TriggerNodeData & NodeCallbacks
  },
) {
  const { id, data } = props
  const events = data.events ?? []
  const selected = data.eventName
    ? events.find((e) => e.name === data.eventName)
    : undefined
  return (
    <div className="rounded-lg border-2 border-primary bg-card p-4 shadow-sm min-w-[260px]">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{m.triggers_node_trigger()}</span>
      </div>
      <Label className="text-xs">{m.triggers_editor_event_label()}</Label>
      <select
        className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
        value={data.eventName}
        onChange={(e) =>
          data.onUpdateData?.(id, { eventName: e.target.value })
        }
      >
        <option value="">{m.triggers_editor_event_placeholder()}</option>
        {events.map((evt) => (
          <option key={evt.name} value={evt.name}>
            {evt.name}
          </option>
        ))}
      </select>
      {selected?.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {selected.description}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ConditionNode

export function ConditionNode(
  props: NodeProps & {
    data: ConditionNodeData & NodeCallbacks
  },
) {
  const { id, data } = props
  return (
    <div className="rounded-lg border-2 border-amber-500 bg-card p-4 shadow-sm min-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{m.triggers_node_condition()}</span>
        <button
          aria-label={m.triggers_node_remove()}
          onClick={() => data.onDelete?.(id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <Label className="text-xs">{m.triggers_condition_jsonlogic_label()}</Label>
      <Textarea
        rows={4}
        className="mt-1 font-mono text-xs"
        placeholder='{"==": [{"var": "level"}, 10]}'
        value={data.jsonLogicText}
        onChange={(e) =>
          data.onUpdateData?.(id, { jsonLogicText: e.target.value })
        }
      />
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
        {m.triggers_condition_jsonlogic_help()}
      </p>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ActionNode

export function ActionNode(
  props: NodeProps & {
    data: ActionNodeData & NodeCallbacks
  },
) {
  const { id, data } = props
  const action = data.action

  const isStub = action.type !== "emit_event"
  const Icon = ICON_BY_TYPE[action.type] ?? Zap
  return (
    <div className="rounded-lg border-2 border-emerald-500 bg-card p-4 shadow-sm min-w-[320px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold">
            {actionTypeLabel(action.type)}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {action.type}
          </Badge>
        </div>
        <button
          aria-label={m.triggers_node_remove()}
          onClick={() => data.onDelete?.(id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {action.type === "emit_event" && (
        <EmitEventForm id={id} action={action} update={data.onUpdateData} />
      )}
      {isStub && (
        <p className="text-xs text-muted-foreground italic">
          {m.triggers_action_stub_notice()}
        </p>
      )}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const ICON_BY_TYPE: Record<string, typeof Zap> = {
  emit_event: Zap,
  grant_reward: Gift,
  unlock_feature: Lock,
  send_notification: Mail,
}

function actionTypeLabel(type: string): string {
  switch (type) {
    case "emit_event":
      return m.triggers_node_action_emit_event()
    case "grant_reward":
      return m.triggers_node_action_grant_reward()
    case "unlock_feature":
      return m.triggers_node_action_unlock_feature()
    case "send_notification":
      return m.triggers_node_action_send_notification()
    default:
      return type
  }
}

function EmitEventForm(props: {
  id: string
  action: { type: "emit_event"; eventName: string; data: Record<string, unknown> }
  update?: (id: string, patch: Record<string, unknown>) => void
}) {
  const { id, action, update } = props
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">{m.triggers_action_field_eventName()}</Label>
        <Input
          className="mt-1 text-xs"
          value={action.eventName}
          placeholder="e.g. feature.unlocked"
          onChange={(e) =>
            update?.(id, {
              action: { ...action, eventName: e.target.value },
            })
          }
        />
      </div>
      <div>
        <Label className="text-xs">{m.triggers_action_field_data()}</Label>
        <Textarea
          rows={3}
          className="mt-1 font-mono text-xs"
          placeholder='{"featureKey": "map_b"}'
          value={JSON.stringify(action.data, null, 2)}
          onChange={(e) => {
            try {
              const data = JSON.parse(e.target.value)
              update?.(id, { action: { ...action, data } })
            } catch {
              // 非法 JSON 暂不更新
            }
          }}
        />
      </div>
    </div>
  )
}

/** 注册到 ReactFlow 的 nodeTypes. */
export const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
}
