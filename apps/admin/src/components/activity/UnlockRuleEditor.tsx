import { X } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import * as m from "#/paraglide/messages.js"

/**
 * Visual editor for ActivityNodeUnlockRule. Maps each field of the
 * server's union shape to a row:
 *
 *   requirePrevNodeAliases?: string[]      → chip list w/ add input
 *   minActivityPoints?: number             → number input
 *   notBefore?: string (ISO)               → datetime-local
 *   relativeToStartSeconds?: number        → number input
 *
 * Empty field === undefined (not present in the rule). All four are
 * AND-combined on the server. Returns the structured object directly
 * — no JSON parsing in callers.
 */
export interface UnlockRule {
  requirePrevNodeAliases?: string[]
  minActivityPoints?: number
  notBefore?: string
  relativeToStartSeconds?: number
}

interface Props {
  value: UnlockRule | null
  onChange: (next: UnlockRule | null) => void
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(s: string): string | undefined {
  if (!s) return undefined
  return new Date(s).toISOString()
}

export function UnlockRuleEditor({ value, onChange }: Props) {
  const rule = value ?? {}

  function patch(p: Partial<UnlockRule>) {
    const merged: UnlockRule = { ...rule, ...p }
    // Strip undefined/empty so the wire shape stays clean.
    const cleaned: UnlockRule = {}
    if (merged.requirePrevNodeAliases?.length) {
      cleaned.requirePrevNodeAliases = merged.requirePrevNodeAliases
    }
    if (
      typeof merged.minActivityPoints === "number" &&
      Number.isFinite(merged.minActivityPoints) &&
      merged.minActivityPoints > 0
    ) {
      cleaned.minActivityPoints = merged.minActivityPoints
    }
    if (merged.notBefore) cleaned.notBefore = merged.notBefore
    if (
      typeof merged.relativeToStartSeconds === "number" &&
      Number.isFinite(merged.relativeToStartSeconds)
    ) {
      cleaned.relativeToStartSeconds = merged.relativeToStartSeconds
    }
    onChange(Object.keys(cleaned).length === 0 ? null : cleaned)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      {/* requirePrevNodeAliases */}
      <PrevNodesField
        value={rule.requirePrevNodeAliases ?? []}
        onChange={(next) => patch({ requirePrevNodeAliases: next })}
      />

      {/* minActivityPoints */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {m.activity_node_unlock_min_points_label()}
        </Label>
        <Input
          type="number"
          min={0}
          value={rule.minActivityPoints ?? ""}
          onChange={(e) => {
            const v = e.target.value
            patch({
              minActivityPoints: v === "" ? undefined : Number(v) || undefined,
            })
          }}
          placeholder={m.activity_node_unlock_min_points_placeholder()}
        />
      </div>

      {/* notBefore */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {m.activity_node_unlock_not_before_label()}
        </Label>
        <Input
          type="datetime-local"
          value={toLocalInput(rule.notBefore)}
          onChange={(e) => patch({ notBefore: fromLocalInput(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          {m.activity_node_unlock_not_before_hint()}
        </p>
      </div>

      {/* relativeToStartSeconds */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {m.activity_node_unlock_relative_label()}
        </Label>
        <Input
          type="number"
          value={rule.relativeToStartSeconds ?? ""}
          onChange={(e) => {
            const v = e.target.value
            patch({
              relativeToStartSeconds:
                v === "" ? undefined : Number(v) || undefined,
            })
          }}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          {m.activity_node_unlock_relative_hint()}
        </p>
      </div>
    </div>
  )
}

function PrevNodesField({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  function addFromInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== ",") return
    e.preventDefault()
    const target = e.currentTarget
    const v = target.value.trim().toLowerCase()
    if (!v) return
    if (value.includes(v)) {
      target.value = ""
      return
    }
    onChange([...value, v])
    target.value = ""
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">
        {m.activity_node_unlock_prev_nodes_label()}
      </Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-2">
        {value.map((alias, idx) => (
          <Badge key={alias} variant="secondary" className="gap-1 pr-1">
            <code className="text-xs">{alias}</code>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label="remove"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          type="text"
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          placeholder={
            value.length === 0
              ? m.activity_node_unlock_prev_nodes_placeholder()
              : ""
          }
          onKeyDown={addFromInput}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {m.activity_node_unlock_prev_nodes_hint()}
      </p>
    </div>
  )
}
