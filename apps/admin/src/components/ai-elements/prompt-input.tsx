import { ArrowUpIcon, SquareIcon } from "lucide-react"
import * as React from "react"

import { MentionPopover } from "#/components/admin-agent/MentionPopover"
import type {
  MentionRef,
  MentionResult,
  MentionType,
} from "#/components/admin-agent/mention-types"
import { useMentionTypes } from "#/components/admin-agent/useMentionTypes"
import { Button } from "#/components/ui/button"
import { Textarea } from "#/components/ui/textarea"
import { cn } from "#/lib/utils"

/**
 * Token used in the textarea after a mention is selected. We don't render
 * a real chip — this is a plain textarea — but we wrap the display name
 * with zero-width markers so:
 *   - the user sees natural text "@7日签到 帮我关闭",
 *   - we can reliably detect deletions by searching for the marker pair
 *     in the controlled value.
 *
 * Zero-width chars (U+200B) are invisible but survive copy/paste, so the
 * pair-tracking is sturdy enough for the v1.
 */
const ZERO_WIDTH = "​"
const MENTION_TRIGGER_RE = /(?:^|\s)@([^\s@]*)$/

/**
 * Build the inline display string for a selected mention. Wrap with
 * zero-width markers so we can match-and-clean later without relying on
 * the (mutable) display name alone.
 */
function formatMentionToken(name: string): string {
  return `${ZERO_WIDTH}@${name}${ZERO_WIDTH}`
}

/**
 * Find the @-trigger ahead of the textarea caret. Returns `null` when
 * the caret isn't immediately after a `@<query>` token (i.e. popover
 * should be closed).
 */
function detectTrigger(
  value: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = value.slice(0, caret)
  const m = before.match(MENTION_TRIGGER_RE)
  if (!m) return null
  // Caret must be right at the end of the matched query (no whitespace
  // after). The regex anchors to end-of-string for `before`, so this is
  // automatic — we just need to compute start/end indices.
  const matchStart = (m.index ?? 0) + m[0].indexOf("@")
  return {
    start: matchStart,
    end: caret,
    query: m[1] ?? "",
  }
}

/**
 * Reconcile the `mentions[]` sidecar with the textarea value: drop any
 * mention whose token (zero-width-wrapped name) no longer appears in the
 * text. Same-name dupes are tracked by occurrence count.
 */
function reconcileMentions(
  value: string,
  mentions: ReadonlyArray<MentionRef & { name: string }>,
): Array<MentionRef & { name: string }> {
  if (mentions.length === 0) return []
  // Build a frequency map of tokens present in the value.
  const present = new Map<string, number>()
  const tokenRe = new RegExp(`${ZERO_WIDTH}@([^${ZERO_WIDTH}]+)${ZERO_WIDTH}`, "g")
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(value)) != null) {
    const name = m[1]!
    present.set(name, (present.get(name) ?? 0) + 1)
  }
  // Walk mentions in order, decrementing the present-count each time we
  // accept one. Any mention whose name has 0 remaining tokens is dropped.
  const remaining = new Map(present)
  const kept: Array<MentionRef & { name: string }> = []
  for (const mention of mentions) {
    const left = remaining.get(mention.name) ?? 0
    if (left > 0) {
      kept.push(mention)
      remaining.set(mention.name, left - 1)
    }
  }
  return kept
}

export type PromptInputMention = MentionRef & { name: string }

export function PromptInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder = "描述你想要的配置 ...",
  className,
  mentions: controlledMentions,
  onMentionsChange,
  mentionTypes,
}: {
  /**
   * Called when the user submits. `mentions` is the sidecar of @-resource
   * references entered alongside the text — empty array when the user
   * didn't @-mention anything.
   */
  onSubmit: (text: string, mentions: PromptInputMention[]) => void
  /** Called when the user clicks the stop button while a response is streaming. */
  onStop?: () => void
  /** Disable input + submit (separate from streaming — e.g. while pending auth). */
  disabled?: boolean
  /** Streaming in progress. Submit becomes Stop. */
  isStreaming?: boolean
  placeholder?: string
  className?: string
  /**
   * Controlled `mentions` array. Optional — when omitted the component
   * manages its own state. When present, `onMentionsChange` MUST be
   * provided so the parent can render or persist the sidecar.
   */
  mentions?: PromptInputMention[]
  onMentionsChange?: (mentions: PromptInputMention[]) => void
  /**
   * Restrict the mention popover to specific resource types. Omit to
   * show every registered type.
   */
  mentionTypes?: readonly string[]
}) {
  const [value, setValue] = React.useState("")
  const [internalMentions, setInternalMentions] = React.useState<
    PromptInputMention[]
  >([])
  const mentions = controlledMentions ?? internalMentions
  const setMentions = React.useCallback(
    (next: PromptInputMention[]) => {
      if (onMentionsChange) onMentionsChange(next)
      else setInternalMentions(next)
    },
    [onMentionsChange],
  )

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [trigger, setTrigger] = React.useState<{
    start: number
    end: number
    query: string
  } | null>(null)

  const { types: allTypes } = useMentionTypes()
  const visibleTypes: MentionType[] = React.useMemo(() => {
    if (!mentionTypes || mentionTypes.length === 0) return allTypes
    const set = new Set(mentionTypes)
    return allTypes.filter((t) => set.has(t.type))
  }, [allTypes, mentionTypes])

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    // Strip zero-width markers from the outgoing text so the LLM sees
    // natural "@7日签到", not the wrapped form.
    const clean = trimmed.replace(new RegExp(ZERO_WIDTH, "g"), "")
    onSubmit(clean, mentions)
    setValue("")
    setMentions([])
    setTrigger(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When popover is open, Enter / Esc go to it (cmdk handles arrows
    // via its CommandList). Defer Enter to popover only when there's a
    // visible result to select; otherwise fall through to submit.
    if (trigger) {
      if (e.key === "Escape") {
        e.preventDefault()
        setTrigger(null)
        return
      }
      // Enter: let cmdk handle if popover has selection. Simpler: always
      // close popover on Enter and submit if no mention selected.
      // For now, Enter while popover open closes it without submitting,
      // matching most chat apps' behavior.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        setTrigger(null)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setValue(next)
    const caret = e.target.selectionStart ?? next.length
    const t = detectTrigger(next, caret)
    setTrigger(t)
    // Reconcile mentions: any token deleted from the text drops the
    // corresponding entry from the sidecar.
    const kept = reconcileMentions(next, mentions)
    if (kept.length !== mentions.length) setMentions(kept)
  }

  function handleSelectMention(result: MentionResult) {
    if (!trigger || !textareaRef.current) return
    const token = formatMentionToken(result.name) + " "
    const newValue =
      value.slice(0, trigger.start) + token + value.slice(trigger.end)
    setValue(newValue)
    setMentions([
      ...mentions,
      { type: result.type, id: result.id, name: result.name },
    ])
    setTrigger(null)
    // Restore caret position right after the inserted token.
    const nextCaret = trigger.start + token.length
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        "relative flex shrink-0 items-end gap-2 border-t bg-background p-3",
        className,
      )}
    >
      <MentionPopover
        open={trigger != null}
        query={trigger?.query ?? ""}
        types={visibleTypes}
        onSelect={handleSelectMention}
        onClose={() => setTrigger(null)}
      />
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Defer close so a popover click registers first.
          setTimeout(() => setTrigger(null), 100)
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-[40px] max-h-[120px] resize-none"
      />
      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={onStop}
          aria-label="停止生成"
        >
          <SquareIcon className="size-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !value.trim()}
          aria-label="发送"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      )}
    </form>
  )
}
