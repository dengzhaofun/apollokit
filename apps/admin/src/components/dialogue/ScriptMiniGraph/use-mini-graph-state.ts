import { MarkerType, type Edge, type Node } from "@xyflow/react"
import { useMemo } from "react"

import type { Character } from "#/lib/types/character"
import type { DialogueNode } from "#/lib/types/dialogue"

import { layoutMiniGraph } from "./auto-layout"
import { deriveIssues } from "./derive-issues"
import type { MiniNodeData } from "./MiniNode"

interface UseMiniGraphStateArgs {
  nodes: DialogueNode[]
  startNodeId: string
  focusedNodeId: string | null
  characters: Character[]
}

interface MiniGraphState {
  rfNodes: Node<MiniNodeData>[]
  rfEdges: Edge[]
  orphanCount: number
  danglingCount: number
}

const PREVIEW_LEN = 30

function previewSpeaker(
  node: DialogueNode,
  charactersById: Map<string, Character>,
): string {
  if (node.speaker.characterId) {
    return (
      charactersById.get(node.speaker.characterId)?.name ??
      node.speaker.characterId
    )
  }
  return node.speaker.name?.trim() ?? ""
}

function previewContent(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= PREVIEW_LEN) return trimmed
  return trimmed.slice(0, PREVIEW_LEN) + "…"
}

export function useMiniGraphState({
  nodes,
  startNodeId,
  focusedNodeId,
  characters,
}: UseMiniGraphStateArgs): MiniGraphState {
  return useMemo(() => {
    const charactersById = new Map(characters.map((c) => [c.id, c]))
    const issues = deriveIssues(nodes, startNodeId)
    const layout = layoutMiniGraph(nodes)
    const ids = new Set(nodes.map((n) => n.id))

    // Per-node "has dangling" flag — surface a warning on the source node
    // so the broken pointer is discoverable even though we can't render
    // an edge to a non-existent target.
    const nodeHasDangling = new Set<string>()
    for (const key of issues.danglingEdgeKeys) {
      nodeHasDangling.add(key.split("::")[0]!)
    }

    const rfNodes: Node<MiniNodeData>[] = nodes.map((n) => {
      const pos = layout.get(n.id) ?? { x: 0, y: 0 }
      return {
        id: n.id,
        type: "dialogue",
        position: pos,
        data: {
          nodeId: n.id,
          speakerName: previewSpeaker(n, charactersById),
          contentPreview: previewContent(n.content),
          isStart: n.id === startNodeId,
          isOrphan: issues.orphanIds.has(n.id),
          isFocused: focusedNodeId === n.id,
          hasDangling: nodeHasDangling.has(n.id),
        },
        selectable: true,
        draggable: false,
        connectable: false,
      }
    })

    const rfEdges: Edge[] = []
    for (const n of nodes) {
      if (n.next && ids.has(n.next)) {
        rfEdges.push({
          id: `${n.id}->${n.next}::default`,
          source: n.id,
          target: n.next,
          type: "default",
          style: { stroke: "var(--muted-foreground)", strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        })
      }
      for (const opt of n.options ?? []) {
        if (!opt.next || !ids.has(opt.next)) continue
        rfEdges.push({
          id: `${n.id}->${opt.next}::${opt.id}`,
          source: n.id,
          target: opt.next,
          type: "default",
          style: { stroke: "var(--primary)", strokeWidth: 1.25 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          label: opt.label || opt.id,
          labelStyle: { fontSize: 10 },
          labelBgStyle: { fill: "var(--card)" },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 3,
        })
      }
    }

    return {
      rfNodes,
      rfEdges,
      orphanCount: issues.orphanIds.size,
      danglingCount: issues.danglingEdgeKeys.size,
    }
  }, [nodes, startNodeId, focusedNodeId, characters])
}
