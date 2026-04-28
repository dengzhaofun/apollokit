import type { DialogueNode } from "#/lib/types/dialogue"

export interface GraphIssues {
  /** Node ids with no incoming edges (and not the start node). */
  orphanIds: Set<string>
  /** Edges whose target is not in the node set. Source key encodes
   *  origin: `${nodeId}` for default `next`, `${nodeId}::${optionId}`
   *  for option-level jumps. */
  danglingEdgeKeys: Set<string>
}

export function deriveIssues(
  nodes: DialogueNode[],
  startNodeId: string,
): GraphIssues {
  const ids = new Set(nodes.map((n) => n.id))
  const inDegree = new Map<string, number>()
  const danglingEdgeKeys = new Set<string>()

  for (const n of nodes) {
    if (n.next) {
      if (ids.has(n.next)) {
        inDegree.set(n.next, (inDegree.get(n.next) ?? 0) + 1)
      } else {
        danglingEdgeKeys.add(n.id)
      }
    }
    for (const opt of n.options ?? []) {
      if (opt.next) {
        if (ids.has(opt.next)) {
          inDegree.set(opt.next, (inDegree.get(opt.next) ?? 0) + 1)
        } else {
          danglingEdgeKeys.add(`${n.id}::${opt.id}`)
        }
      }
    }
  }

  const orphanIds = new Set<string>()
  for (const n of nodes) {
    if (n.id === startNodeId) continue
    if ((inDegree.get(n.id) ?? 0) === 0) orphanIds.add(n.id)
  }

  return { orphanIds, danglingEdgeKeys }
}
