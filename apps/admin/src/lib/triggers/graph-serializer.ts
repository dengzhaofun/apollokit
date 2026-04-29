/**
 * xyflow graph ↔ runtime rule 互转。
 *
 * 后端运行时只读 normalized 字段:
 *   - rule.triggerEvent  ← TriggerNode.data.eventName
 *   - rule.condition     ← ConditionNode.data.jsonLogic (若无 ConditionNode 则 null)
 *   - rule.actions       ← ActionNode 数组按拓扑顺序
 *
 * 而 rule.graph 字段持久化整个 xyflow nodes/edges,admin 重打开规则时
 * 直接复原画布(节点位置 + 自定义参数)。
 *
 * Canvas 拓扑约定:
 *   一个唯一的 TriggerNode (id="trigger") 起点
 *   → 可选 0 或 1 个 ConditionNode (id="condition")
 *   → N 个 ActionNode (id="action-<uuid>") 按数组顺序串联
 *   边只连接相邻节点(简化:线性串行执行,运行时按 actions 数组顺序跑)。
 */

import type { Edge, Node } from "@xyflow/react"

import type {
  TriggerAction,
  TriggerGraph,
  TriggerRule,
} from "#/lib/types/triggers"

// ── Node data shapes ───────────────────────────────────────────────────

export type TriggerNodeData = {
  /** 选中的事件名(对应 event-catalog 里的 name)。 */
  eventName: string
}

export type ConditionNodeData = {
  /** JSONLogic raw 字符串(用户输入)。运行时 parse;空串 = null condition。 */
  jsonLogicText: string
}

export type ActionNodeData = {
  action: TriggerAction
}

export type TriggerCanvasNode =
  | (Node<TriggerNodeData> & { type: "trigger" })
  | (Node<ConditionNodeData> & { type: "condition" })
  | (Node<ActionNodeData> & { type: "action" })

// ── Default new-rule canvas ────────────────────────────────────────────

export function buildDefaultCanvas(): { nodes: TriggerCanvasNode[]; edges: Edge[] } {
  const triggerNode: TriggerCanvasNode = {
    id: "trigger",
    type: "trigger",
    position: { x: 100, y: 100 },
    data: { eventName: "" },
  }
  return { nodes: [triggerNode], edges: [] }
}

// ── Canvas → runtime ───────────────────────────────────────────────────

export type SerializeResult = {
  triggerEvent: string
  condition: unknown | null
  actions: TriggerAction[]
  graph: TriggerGraph
}

export function serializeCanvas(
  nodes: TriggerCanvasNode[],
  edges: Edge[],
): SerializeResult {
  const triggerNode = nodes.find(
    (n): n is TriggerCanvasNode & { type: "trigger" } => n.type === "trigger",
  )
  const conditionNode = nodes.find(
    (n): n is TriggerCanvasNode & { type: "condition" } =>
      n.type === "condition",
  )
  const actionNodes = nodes.filter(
    (n): n is TriggerCanvasNode & { type: "action" } => n.type === "action",
  )

  const triggerEvent = triggerNode?.data.eventName ?? ""

  let condition: unknown | null = null
  if (conditionNode) {
    const text = conditionNode.data.jsonLogicText.trim()
    if (text) {
      try {
        condition = JSON.parse(text)
      } catch {
        // 非法 JSON 留 null,UI 会校验给警告
        condition = null
      }
    }
  }

  // Action 排序:沿 trigger → (condition →) action edge 链拓扑遍历;
  // 找不到 edge 链时按节点 id 字典序作 fallback,避免静默丢节点。
  const orderedActions = orderActions(nodes, edges, actionNodes)
  const actions = orderedActions.map((n) => n.data.action)

  const graph: TriggerGraph = {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }

  return { triggerEvent, condition, actions, graph }
}

function orderActions(
  allNodes: TriggerCanvasNode[],
  edges: Edge[],
  actionNodes: Array<TriggerCanvasNode & { type: "action" }>,
): Array<TriggerCanvasNode & { type: "action" }> {
  if (actionNodes.length === 0) return []
  // BFS 从 trigger / condition 起点
  const start = allNodes.find((n) => n.type === "trigger")
  if (!start) return [...actionNodes].sort((a, b) => a.id.localeCompare(b.id))

  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  const visited = new Set<string>()
  const ordered: Array<TriggerCanvasNode & { type: "action" }> = []
  const queue: string[] = [start.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = allNodes.find((n) => n.id === id)
    if (node && node.type === "action") {
      ordered.push(node as TriggerCanvasNode & { type: "action" })
    }
    const next = adj.get(id) ?? []
    queue.push(...next)
  }
  // 漏掉的(画布上孤立的 action 节点)按 id 字典序补到末尾
  for (const n of actionNodes) {
    if (!visited.has(n.id)) ordered.push(n)
  }
  return ordered
}

// ── Runtime → canvas (rule.graph 复原) ─────────────────────────────────

export function deserializeRule(
  rule: Pick<TriggerRule, "triggerEvent" | "condition" | "actions" | "graph">,
): { nodes: TriggerCanvasNode[]; edges: Edge[] } {
  // 优先用 graph 字段(完整 nodes + 位置);若没有(SDK 直接 POST 创建),
  // 用 actions/triggerEvent 反推一个线性默认布局。
  if (rule.graph && Array.isArray(rule.graph.nodes) && rule.graph.nodes.length > 0) {
    const nodes: TriggerCanvasNode[] = rule.graph.nodes.map((n) => ({
      id: n.id,
      type: n.type as TriggerCanvasNode["type"],
      position: n.position,
      data: n.data ?? {},
    })) as TriggerCanvasNode[]
    return { nodes, edges: rule.graph.edges as Edge[] }
  }

  // Fallback:线性布局
  const nodes: TriggerCanvasNode[] = []
  const edges: Edge[] = []
  const triggerNode: TriggerCanvasNode = {
    id: "trigger",
    type: "trigger",
    position: { x: 100, y: 100 },
    data: { eventName: rule.triggerEvent },
  }
  nodes.push(triggerNode)
  let prevId = "trigger"
  let yOffset = 250

  if (rule.condition !== null && rule.condition !== undefined) {
    const condNode: TriggerCanvasNode = {
      id: "condition",
      type: "condition",
      position: { x: 100, y: yOffset },
      data: { jsonLogicText: JSON.stringify(rule.condition, null, 2) },
    }
    nodes.push(condNode)
    edges.push({
      id: `${prevId}->condition`,
      source: prevId,
      target: "condition",
    })
    prevId = "condition"
    yOffset += 200
  }

  rule.actions.forEach((action, i) => {
    const id = `action-${i}`
    nodes.push({
      id,
      type: "action",
      position: { x: 100, y: yOffset },
      data: { action },
    })
    edges.push({ id: `${prevId}->${id}`, source: prevId, target: id })
    prevId = id
    yOffset += 200
  })

  return { nodes, edges }
}

// ── Helper: append a new ActionNode auto-positioned ────────────────────

export function buildNewActionNode(
  existing: TriggerCanvasNode[],
  action: TriggerAction,
): TriggerCanvasNode {
  const id = `action-${crypto.randomUUID().slice(0, 8)}`
  // 找 y 最大的节点放在它下面 200px。
  const maxY = existing.reduce((m, n) => Math.max(m, n.position.y), 0)
  return {
    id,
    type: "action",
    position: { x: 100, y: maxY + 200 },
    data: { action },
  }
}

export function buildConditionNode(
  existing: TriggerCanvasNode[],
): TriggerCanvasNode {
  const triggerNode = existing.find((n) => n.type === "trigger")
  const x = triggerNode?.position.x ?? 100
  const y = (triggerNode?.position.y ?? 100) + 200
  return {
    id: "condition",
    type: "condition",
    position: { x, y },
    data: { jsonLogicText: "" },
  }
}
