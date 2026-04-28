import dagre from "@dagrejs/dagre"

import type { DialogueNode } from "#/lib/types/dialogue"

export const MINI_NODE_WIDTH = 184
export const MINI_NODE_HEIGHT = 72

/**
 * Run dagre top-to-bottom layout over the dialogue graph and return a map
 * from node id → top-left {x, y} suitable for React Flow.
 *
 * Edges with a target id that doesn't exist in `nodes` are skipped — they
 * still render as dangling edges but can't participate in layout.
 */
export function layoutMiniGraph(
  nodes: DialogueNode[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 56, marginx: 16, marginy: 16 })

  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    g.setNode(n.id, { width: MINI_NODE_WIDTH, height: MINI_NODE_HEIGHT })
  }
  for (const n of nodes) {
    if (n.next && ids.has(n.next)) g.setEdge(n.id, n.next)
    for (const opt of n.options ?? []) {
      if (opt.next && ids.has(opt.next)) g.setEdge(n.id, opt.next)
    }
  }

  dagre.layout(g)

  const out = new Map<string, { x: number; y: number }>()
  for (const id of g.nodes()) {
    const { x, y } = g.node(id)
    out.set(id, {
      x: x - MINI_NODE_WIDTH / 2,
      y: y - MINI_NODE_HEIGHT / 2,
    })
  }
  return out
}
