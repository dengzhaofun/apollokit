import {
  Background,
  Controls,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { AlertTriangle, Flag, Unlink } from "lucide-react"
import { useCallback, useMemo } from "react"

import type { Character } from "#/lib/types/character"
import type { DialogueNode } from "#/lib/types/dialogue"
import * as m from "#/paraglide/messages.js"

import { MiniNode } from "./MiniNode"
import { useMiniGraphState } from "./use-mini-graph-state"

interface ScriptMiniGraphProps {
  nodes: DialogueNode[]
  startNodeId: string
  focusedNodeId: string | null
  characters: Character[]
  onJumpToNode: (id: string) => void
}

const nodeTypes = { dialogue: MiniNode }

export function ScriptMiniGraph(props: ScriptMiniGraphProps) {
  return (
    <ReactFlowProvider>
      <ScriptMiniGraphInner {...props} />
    </ReactFlowProvider>
  )
}

function ScriptMiniGraphInner({
  nodes,
  startNodeId,
  focusedNodeId,
  characters,
  onJumpToNode,
}: ScriptMiniGraphProps) {
  const { rfNodes, rfEdges, orphanCount, danglingCount } = useMiniGraphState({
    nodes,
    startNodeId,
    focusedNodeId,
    characters,
  })

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onJumpToNode(node.id)
    },
    [onJumpToNode],
  )

  const isEmpty = nodes.length === 0

  // Stable defaultEdgeOptions to keep the canvas free of yellow warning
  // outlines on edges that would otherwise adopt RF's default selection
  // styling on click.
  const defaultEdgeOptions = useMemo(
    () => ({ focusable: false, selectable: false }),
    [],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {m.dialogue_minigraph_title()}
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Flag className="size-3 text-emerald-600" />
            {m.dialogue_minigraph_start()}
          </span>
          {orphanCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-amber-600"
              title={m.dialogue_minigraph_orphan()}
            >
              <AlertTriangle className="size-3" />
              {orphanCount}
            </span>
          ) : null}
          {danglingCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-destructive"
              title={m.dialogue_minigraph_dangling()}
            >
              <Unlink className="size-3" />
              {danglingCount}
            </span>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {m.dialogue_minigraph_empty()}
        </div>
      ) : (
        <div className="relative flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.1, minZoom: 0.3 }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={defaultEdgeOptions}
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background gap={16} size={1} />
            <Controls
              showInteractive={false}
              className="!bg-card !border-border [&_button]:!bg-card [&_button]:!border-border"
            />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
