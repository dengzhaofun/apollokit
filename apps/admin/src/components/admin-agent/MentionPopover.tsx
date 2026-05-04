import * as React from "react"
import * as m from "#/paraglide/messages.js"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import { cn } from "#/lib/utils"

import type { MentionResult, MentionType } from "./mention-types"
import { useMentionSearch } from "./useMentionSearch"

/**
 * Lightweight popover for the @-mention picker. Renders inline (absolute-
 * positioned to its parent's `relative` wrapper) so it floats above the
 * textarea without needing portal/anchor plumbing — the prompt input
 * already owns the layout.
 *
 * Behavior:
 *   - The input box uses cmdk's CommandInput (search), driven by the
 *     `query` prop coming from the textarea's @-tail substring.
 *   - Type tabs above the list let the user narrow to one resource type;
 *     `null` selectedType means "all types".
 *   - Up/Down arrows + Enter to select are handled by cmdk natively.
 *
 * The parent (`PromptInput`) controls open/close, current query, and
 * receives the `onSelect(result)` callback; this component is dumb about
 * the textarea state.
 */
export function MentionPopover({
  open,
  query,
  types,
  onSelect,
  onClose,
  className,
}: {
  open: boolean
  /** The text after `@` in the textarea — used as the search query. */
  query: string
  /** Available types for tab navigation. */
  types: MentionType[]
  onSelect: (result: MentionResult) => void
  onClose: () => void
  className?: string
}) {
  const [selectedType, setSelectedType] = React.useState<string | null>(null)

  const filterTypes = React.useMemo(
    () => (selectedType ? [selectedType] : undefined),
    [selectedType],
  )

  const { results, isLoading, error } = useMentionSearch({
    q: query,
    types: filterTypes,
    enabled: open,
  })

  // Group by type for visual scanning. Order = registry order to keep the
  // popover stable across keystrokes.
  const grouped = React.useMemo(() => {
    const m = new Map<string, MentionResult[]>()
    for (const r of results) {
      const arr = m.get(r.type) ?? []
      arr.push(r)
      m.set(r.type, arr)
    }
    return m
  }, [results])

  // Reset the type filter every time the popover (re)opens so it doesn't
  // get stuck on a previous selection.
  React.useEffect(() => {
    if (open) setSelectedType(null)
  }, [open])

  if (!open) return null

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
      // Stop pointer events from bubbling to the form / textarea
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Type tabs */}
      <div className="flex flex-wrap gap-1 border-b px-2 py-1.5">
        <TypeTab
          label="全部"
          active={selectedType == null}
          onClick={() => setSelectedType(null)}
        />
        {types.map((t) => (
          <TypeTab
            key={t.type}
            label={t.label}
            active={selectedType === t.type}
            onClick={() => setSelectedType(t.type)}
          />
        ))}
      </div>

      <Command shouldFilter={false} className="max-h-72">
        {/* Hidden — the textarea already shows the user what they're
            typing; we only need the value bound here so cmdk knows what
            to filter. We keep an invisible input for accessibility. */}
        <CommandInput
          value={query}
          onValueChange={() => {
            /* read-only — controlled by textarea */
          }}
          placeholder={m.admin_agent_search_placeholder()}
          className="sr-only"
        />
        {/* min-h on the list reserves height across the empty / loading /
            results transitions so the popover doesn't visibly snap as
            requests resolve — pre-200ms-debounce the list is empty,
            then loading text replaces empty, then results push the
            container taller. Without a floor each step retriggers
            layout. The chosen value (~200px) accommodates ~5 rows so
            most search results render without reaching for max-h. */}
        <CommandList className="min-h-[200px]">
          {error ? (
            <div className="px-3 py-2 text-xs text-destructive">
              加载失败：{error.message}
            </div>
          ) : null}

          {!error && !isLoading && results.length === 0 ? (
            <CommandEmpty>没有匹配的资源</CommandEmpty>
          ) : null}

          {!error && isLoading && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              搜索中…
            </div>
          ) : null}

          {Array.from(grouped.entries()).map(([typeKey, items]) => {
            const typeMeta = types.find((t) => t.type === typeKey)
            return (
              <CommandGroup
                key={typeKey}
                heading={typeMeta?.label ?? typeKey}
              >
                {items.map((r) => (
                  <CommandItem
                    key={`${r.type}:${r.id}`}
                    value={`${r.type}:${r.id}`}
                    onSelect={() => {
                      onSelect(r)
                      onClose()
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{r.name}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {r.alias ? `@${r.alias}` : r.id}
                        {r.subtitle ? ` · ${r.subtitle}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </Command>
    </div>
  )
}

function TypeTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}
