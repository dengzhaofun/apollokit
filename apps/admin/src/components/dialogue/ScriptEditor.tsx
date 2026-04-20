import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { LinkActionEditor } from "#/components/common/LinkActionEditor"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type {
  CreateDialogueScriptInput,
  DialogueNode,
  DialogueOption,
  DialogueScript,
  DialogueSpeakerSide,
} from "#/lib/types/dialogue"
import type { LinkAction } from "#/lib/types/link"
import { validateLinkAction } from "#/lib/types/link"
import * as m from "#/paraglide/messages.js"

interface ScriptEditorProps {
  initial?: DialogueScript
  onSubmit: (values: CreateDialogueScriptInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

function emptyNode(id = ""): DialogueNode {
  return {
    id,
    speaker: { name: "", side: "left" },
    content: "",
  }
}

function emptyOption(id = ""): DialogueOption {
  return { id, label: "" }
}

export function ScriptEditor({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: ScriptEditorProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [repeatable, setRepeatable] = useState<boolean>(
    initial?.repeatable ?? false,
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)
  const [startNodeId, setStartNodeId] = useState<string>(
    initial?.startNodeId ?? "start",
  )
  const [nodes, setNodes] = useState<DialogueNode[]>(
    initial?.nodes ?? [emptyNode("start")],
  )
  const [error, setError] = useState("")

  const nodeIdOptions = nodes.map((n) => n.id).filter(Boolean)

  function updateNode(index: number, patch: Partial<DialogueNode>) {
    setNodes((prev) => {
      const next = [...prev]
      next[index] = { ...next[index]!, ...patch }
      return next
    })
  }

  function addNode() {
    setNodes((prev) => [...prev, emptyNode(`node_${prev.length}`)])
  }

  function removeNode(index: number) {
    setNodes((prev) => prev.filter((_, i) => i !== index))
  }

  function validate(): string | null {
    if (!name.trim()) return m.dialogue_error_name_required()
    const ids = new Set<string>()
    for (const n of nodes) {
      if (!n.id) return m.dialogue_error_name_required()
      if (ids.has(n.id)) return m.dialogue_error_duplicate_node_id()
      ids.add(n.id)
    }
    if (!ids.has(startNodeId)) return m.dialogue_error_start_node_invalid()
    for (const n of nodes) {
      if (n.next && !ids.has(n.next)) return m.dialogue_error_bad_next()
      if (n.options) {
        const optIds = new Set<string>()
        for (const o of n.options) {
          if (optIds.has(o.id)) return m.dialogue_error_duplicate_option_id()
          optIds.add(o.id)
          if (o.next && !ids.has(o.next)) return m.dialogue_error_bad_next()
          if (o.action) {
            const linkErr = validateLinkAction(o.action)
            if (linkErr) return linkErr
          }
        }
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    await onSubmit({
      alias: alias.trim() ? alias.trim() : null,
      name: name.trim(),
      description: description.trim() ? description : null,
      startNodeId,
      nodes,
      repeatable,
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Metadata ───────────────────────────────── */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <Label htmlFor="alias">{m.dialogue_field_alias()}</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="home-tutorial"
          />
          <p className="text-xs text-muted-foreground">
            {m.dialogue_field_alias_hint()}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="name">{m.dialogue_field_name()}</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">
            {m.dialogue_field_description()}
          </Label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>{m.dialogue_field_start_node()}</Label>
            <Select value={startNodeId} onValueChange={setStartNodeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nodeIdOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3">
            <Label htmlFor="repeatable" className="cursor-pointer">
              {m.dialogue_field_repeatable()}
            </Label>
            <Switch
              id="repeatable"
              checked={repeatable}
              onCheckedChange={setRepeatable}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3">
            <Label htmlFor="active" className="cursor-pointer">
              {m.dialogue_field_active()}
            </Label>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </section>

      {/* ── Nodes ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{m.dialogue_nodes_title()}</h2>
          <Button type="button" size="sm" variant="outline" onClick={addNode}>
            <Plus className="size-4" />
            {m.dialogue_add_node()}
          </Button>
        </div>

        {nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.dialogue_nodes_empty()}
          </p>
        ) : (
          nodes.map((node, index) => (
            <NodeCard
              key={index}
              node={node}
              nodeIds={nodeIdOptions}
              onChange={(patch) => updateNode(index, patch)}
              onRemove={() => removeNode(index)}
            />
          ))
        )}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

// ─── NodeCard ────────────────────────────────────────────────────

interface NodeCardProps {
  node: DialogueNode
  nodeIds: string[]
  onChange: (patch: Partial<DialogueNode>) => void
  onRemove: () => void
}

const NEXT_NONE = "__none__"

function NodeCard({
  node,
  nodeIds,
  onChange,
  onRemove,
}: NodeCardProps) {
  function updateOptions(next: DialogueOption[] | undefined) {
    onChange({ options: next })
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">{m.dialogue_node_id()}</Label>
          <Input
            value={node.id}
            onChange={(e) => onChange({ id: e.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 size-9 text-destructive"
          onClick={onRemove}
          title={m.dialogue_remove_node()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">
            {m.dialogue_node_speaker_name()}
          </Label>
          <Input
            value={node.speaker.name}
            onChange={(e) =>
              onChange({
                speaker: { ...node.speaker, name: e.target.value },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            {m.dialogue_node_speaker_avatar()}
          </Label>
          <MediaPickerDialog
            value={node.speaker.avatarUrl ?? null}
            onChange={(url) =>
              onChange({
                speaker: {
                  ...node.speaker,
                  avatarUrl: url || undefined,
                },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            {m.dialogue_node_speaker_side()}
          </Label>
          <Select
            value={node.speaker.side}
            onValueChange={(v) =>
              onChange({
                speaker: { ...node.speaker, side: v as DialogueSpeakerSide },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">{m.dialogue_side_left()}</SelectItem>
              <SelectItem value="right">{m.dialogue_side_right()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{m.dialogue_node_content()}</Label>
        <Textarea
          rows={3}
          value={node.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{m.dialogue_node_next()}</Label>
        <Select
          value={node.next ?? NEXT_NONE}
          onValueChange={(v) =>
            onChange({ next: v === NEXT_NONE ? undefined : v })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEXT_NONE}>
              {m.dialogue_node_next_none()}
            </SelectItem>
            {nodeIds
              .filter((id) => id !== node.id)
              .map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <RewardEntryEditor
        label={m.dialogue_node_on_enter_rewards()}
        entries={node.onEnter?.rewards ?? []}
        onChange={(rewards) =>
          onChange({
            onEnter: rewards.length > 0 ? { rewards } : undefined,
          })
        }
      />

      {/* Options */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {m.dialogue_options_title()}
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              updateOptions([
                ...(node.options ?? []),
                emptyOption(`opt_${(node.options ?? []).length}`),
              ])
            }
          >
            <Plus className="size-4" />
            {m.dialogue_add_option()}
          </Button>
        </div>

        {(node.options ?? []).map((opt, i) => (
          <OptionCard
            key={i}
            option={opt}
            nodeIds={nodeIds.filter((id) => id !== node.id)}
            onChange={(patch) => {
              const next = [...(node.options ?? [])]
              next[i] = { ...next[i]!, ...patch }
              updateOptions(next)
            }}
            onRemove={() => {
              const next = (node.options ?? []).filter((_, j) => j !== i)
              updateOptions(next.length > 0 ? next : undefined)
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── OptionCard ──────────────────────────────────────────────────

interface OptionCardProps {
  option: DialogueOption
  nodeIds: string[]
  onChange: (patch: Partial<DialogueOption>) => void
  onRemove: () => void
}

function OptionCard({
  option,
  nodeIds,
  onChange,
  onRemove,
}: OptionCardProps) {
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">{m.dialogue_option_id()}</Label>
          <Input
            value={option.id}
            onChange={(e) => onChange({ id: e.target.value })}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">{m.dialogue_option_label()}</Label>
          <Input
            value={option.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 size-9 text-destructive"
          onClick={onRemove}
          title={m.dialogue_remove_option()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{m.dialogue_option_next()}</Label>
        <Select
          value={option.next ?? NEXT_NONE}
          onValueChange={(v) =>
            onChange({ next: v === NEXT_NONE ? undefined : v })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEXT_NONE}>
              {m.dialogue_node_next_none()}
            </SelectItem>
            {nodeIds.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <RewardEntryEditor
        label={m.dialogue_option_rewards()}
        entries={option.rewards ?? []}
        onChange={(rewards) =>
          onChange({ rewards: rewards.length > 0 ? rewards : undefined })
        }
      />

      <LinkActionEditor
        label={m.dialogue_option_action()}
        value={option.action ?? { type: "none" }}
        onChange={(action: LinkAction) =>
          onChange({ action: action.type === "none" ? undefined : action })
        }
      />
    </div>
  )
}
