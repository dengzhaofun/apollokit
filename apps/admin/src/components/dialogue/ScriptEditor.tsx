import { PanelRightClose, PanelRightOpen, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { LinkActionEditor } from "#/components/common/LinkActionEditor"
import { ScriptMiniGraph } from "#/components/dialogue/ScriptMiniGraph"
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
import { useAllCharacters } from "#/hooks/use-character"
import type { Character } from "#/lib/types/character"
import type {
  CreateDialogueScriptInput,
  DialogueNode,
  DialogueOption,
  DialogueScript,
  DialogueSpeakerSide,
} from "#/lib/types/dialogue"
import type { LinkAction } from "#/lib/types/link"
import { validateLinkAction } from "#/lib/types/link"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

const MINI_GRAPH_COLLAPSED_KEY = "dialogue.miniGraph.collapsed"

function jumpToNodeCard(nodeId: string) {
  const el = document.querySelector<HTMLElement>(
    `[data-node-id="${CSS.escape(nodeId)}"]`,
  )
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.classList.add("ring-2", "ring-primary", "ring-offset-2")
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-primary", "ring-offset-2")
  }, 1500)
}

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
  // Fetched once for the whole editor so every NodeCard's speaker
  // picker shares the same list without N+1 round-trips.
  const { data: characters } = useAllCharacters()
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
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [graphCollapsed, setGraphCollapsed] = useState(false)

  // Persist sidebar collapse across reloads. SSR-safe: read in effect.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MINI_GRAPH_COLLAPSED_KEY)
      if (stored === "1") setGraphCollapsed(true)
    } catch {
      // ignore — private mode or storage disabled, default to expanded
    }
  }, [])

  function toggleGraphCollapsed() {
    setGraphCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(MINI_GRAPH_COLLAPSED_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }

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
      // speaker must carry a characterId or an inline name — this is
      // what the server validator enforces with .refine(), we mirror
      // it client-side so submit doesn't bounce on a 400.
      if (!n.speaker.characterId && !n.speaker.name?.trim()) {
        return m.dialogue_error_name_required()
      }
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
    <div className="flex gap-6">
      <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-6">
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleGraphCollapsed}
            title={
              graphCollapsed
                ? m.dialogue_minigraph_expand()
                : m.dialogue_minigraph_collapse()
            }
            className="hidden lg:inline-flex"
          >
            {graphCollapsed ? (
              <PanelRightOpen className="size-4" />
            ) : (
              <PanelRightClose className="size-4" />
            )}
            <span className="text-xs">
              {graphCollapsed
                ? m.dialogue_minigraph_expand()
                : m.dialogue_minigraph_collapse()}
            </span>
          </Button>
        </div>
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
            <Select value={startNodeId} onValueChange={(v) => setStartNodeId(v ?? "")}>
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
              characters={characters ?? []}
              isFocused={focusedNodeId === node.id}
              onFocusNode={() => setFocusedNodeId(node.id)}
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

      <aside
        className={cn(
          "sticky top-6 hidden h-[calc(100vh-3rem)] w-[360px] shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm",
          !graphCollapsed && "lg:flex lg:flex-col",
        )}
      >
        <ScriptMiniGraph
          nodes={nodes}
          startNodeId={startNodeId}
          focusedNodeId={focusedNodeId}
          characters={characters ?? []}
          onJumpToNode={(id) => {
            setFocusedNodeId(id)
            jumpToNodeCard(id)
          }}
        />
      </aside>
    </div>
  )
}

// ─── NodeCard ────────────────────────────────────────────────────

interface NodeCardProps {
  node: DialogueNode
  nodeIds: string[]
  characters: Character[]
  isFocused: boolean
  onFocusNode: () => void
  onChange: (patch: Partial<DialogueNode>) => void
  onRemove: () => void
}

const NEXT_NONE = "__none__"
const SPEAKER_MODE_CHARACTER = "character"
const SPEAKER_MODE_INLINE = "inline"

function NodeCard({
  node,
  nodeIds,
  characters,
  isFocused,
  onFocusNode,
  onChange,
  onRemove,
}: NodeCardProps) {
  function updateOptions(next: DialogueOption[] | undefined) {
    onChange({ options: next })
  }

  // Mode is derived from speaker shape, not stored separately — keeps
  // the source of truth in one place and auto-adjusts if the speaker
  // object is mutated by other code paths (e.g. paste-from-JSON in the
  // future).
  const speakerMode = node.speaker.characterId
    ? SPEAKER_MODE_CHARACTER
    : SPEAKER_MODE_INLINE

  return (
    <div
      data-node-id={node.id}
      onFocusCapture={onFocusNode}
      onMouseDown={onFocusNode}
      className={cn(
        "space-y-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow",
        isFocused && "ring-2 ring-primary/40",
      )}
    >
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

      {/* ── Speaker ────────────────────────────────────── */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">
              {m.dialogue_node_speaker_mode()}
            </Label>
            <Select
              value={speakerMode}
              onValueChange={(v) => {
                if (v === SPEAKER_MODE_CHARACTER) {
                  // Switching TO character mode: clear inline
                  // name/avatar so the server-side flatten
                  // unambiguously uses the character's current fields.
                  onChange({
                    speaker: {
                      side: node.speaker.side,
                      characterId: node.speaker.characterId,
                    },
                  })
                } else {
                  // Switching TO inline mode: drop the characterId
                  // reference; seed name from whatever was shown.
                  onChange({
                    speaker: {
                      side: node.speaker.side,
                      name: node.speaker.name ?? "",
                      avatarUrl: node.speaker.avatarUrl,
                    },
                  })
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SPEAKER_MODE_CHARACTER}>
                  {m.dialogue_node_speaker_mode_character()}
                </SelectItem>
                <SelectItem value={SPEAKER_MODE_INLINE}>
                  {m.dialogue_node_speaker_mode_inline()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {m.dialogue_node_speaker_side()}
            </Label>
            <Select
              value={node.speaker.side}
              onValueChange={(v) =>
                onChange({
                  speaker: {
                    ...node.speaker,
                    side: v as DialogueSpeakerSide,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{m.dialogue_side_left()}</SelectItem>
                <SelectItem value="right">
                  {m.dialogue_side_right()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {speakerMode === SPEAKER_MODE_CHARACTER ? (
          <div className="space-y-1">
            <Label className="text-xs">
              {m.dialogue_node_speaker_character()}
            </Label>
            <Select
              value={node.speaker.characterId ?? ""}
              onValueChange={(v) =>
                onChange({
                  speaker: {
                    ...node.speaker,
                    characterId: v ?? undefined,
                    // Pin the picker to one source — clear any inline
                    // override the user may have previously entered.
                    name: undefined,
                    avatarUrl: undefined,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={m.dialogue_node_speaker_character_placeholder()}
                />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.alias ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.alias}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {characters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {m.dialogue_node_speaker_no_characters_tip()}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">
                {m.dialogue_node_speaker_name()}
              </Label>
              <Input
                value={node.speaker.name ?? ""}
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
          </div>
        )}
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
            onChange({ next: !v || v === NEXT_NONE ? undefined : v })
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
            onChange({ next: !v || v === NEXT_NONE ? undefined : v })
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
