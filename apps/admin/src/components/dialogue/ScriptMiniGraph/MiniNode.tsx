import { Handle, type NodeProps, Position } from "@xyflow/react"
import { AlertTriangle, Flag } from "lucide-react"

import { cn } from "#/lib/utils"

import { MINI_NODE_HEIGHT, MINI_NODE_WIDTH } from "./auto-layout"

export interface MiniNodeData {
  nodeId: string
  speakerName: string
  contentPreview: string
  isStart: boolean
  isOrphan: boolean
  isFocused: boolean
  hasDangling: boolean
  [key: string]: unknown
}

export function MiniNode({ data }: NodeProps) {
  const d = data as MiniNodeData
  return (
    <div
      style={{ width: MINI_NODE_WIDTH, height: MINI_NODE_HEIGHT }}
      className={cn(
        "group flex flex-col gap-1 overflow-hidden rounded-md border bg-card px-2 py-1.5 text-left text-[11px] shadow-sm transition-colors",
        "hover:border-primary/60",
        d.isStart && "border-emerald-500 ring-1 ring-emerald-500/30",
        d.isOrphan && "border-amber-500 ring-1 ring-amber-500/30",
        d.isFocused && "border-primary ring-2 ring-primary/40",
        !d.isStart && !d.isOrphan && !d.isFocused && "border-border",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40"
        isConnectable={false}
      />
      <div className="flex items-center gap-1">
        {d.isStart ? (
          <Flag className="size-3 shrink-0 text-emerald-600" />
        ) : null}
        {d.isOrphan ? (
          <AlertTriangle className="size-3 shrink-0 text-amber-600" />
        ) : null}
        <span className="truncate font-mono text-[10px] font-semibold">
          {d.nodeId}
        </span>
        {d.hasDangling ? (
          <span className="ml-auto text-[10px] text-destructive">!</span>
        ) : null}
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        {d.speakerName || "—"}
      </div>
      <div className="line-clamp-1 text-[10px] leading-tight text-foreground/80">
        {d.contentPreview || ""}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40"
        isConnectable={false}
      />
    </div>
  )
}
