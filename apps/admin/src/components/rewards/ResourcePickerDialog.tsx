import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty"
import { Input } from "#/components/ui/input"
import { Skeleton } from "#/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import * as m from "#/paraglide/messages.js"
import {
  useSearchCurrenciesInfinite,
  useSearchEntityBlueprintsInfinite,
  useSearchItemDefinitionsInfinite,
} from "#/hooks/use-resource-search"
import type { CurrencyDefinition } from "#/lib/types/currency"
import type { EntityBlueprint } from "#/lib/types/entity"
import type { ItemDefinition } from "#/lib/types/item"
import type { RewardEntry, RewardType } from "#/lib/types/rewards"

interface ResourcePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Current entries the editor has — used to pre-check the corresponding
   * rows. Dialog never mutates this; on confirm it returns the *new*
   * complete entries via `onConfirm`.
   */
  currentSelection: RewardEntry[]
  onConfirm: (entries: RewardEntry[]) => void
  /** Restrict which type tabs render. Defaults to all three. */
  allowedTypes?: RewardType[]
}

const ALL_TYPES: RewardType[] = ["item", "currency", "entity"]
const SEARCH_DEBOUNCE_MS = 300

function typeLabel(t: RewardType): string {
  switch (t) {
    case "item":
      return m.reward_type_item()
    case "currency":
      return m.reward_type_currency()
    case "entity":
      return m.reward_type_entity()
  }
}

function selectionKey(type: RewardType, id: string) {
  return `${type}:${id}`
}

export function ResourcePickerDialog({
  open,
  onOpenChange,
  currentSelection,
  onConfirm,
  allowedTypes,
}: ResourcePickerDialogProps) {
  const tabs = useMemo<RewardType[]>(
    () =>
      (allowedTypes && allowedTypes.length > 0
        ? ALL_TYPES.filter((t) => allowedTypes.includes(t))
        : ALL_TYPES),
    [allowedTypes],
  )

  const [activeTab, setActiveTab] = useState<RewardType>(tabs[0] ?? "item")
  const [selection, setSelection] = useState<Map<string, RewardEntry>>(
    () => new Map(),
  )

  // Re-seed selection + tab whenever the dialog (re)opens. We avoid
  // syncing while the user is interacting — the parent owns the truth
  // and dialog state is ephemeral per-open.
  useEffect(() => {
    if (!open) return
    setSelection(
      new Map(currentSelection.map((e) => [selectionKey(e.type, e.id), e])),
    )
    setActiveTab((prev) => (tabs.includes(prev) ? prev : (tabs[0] ?? "item")))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggle(type: RewardType, id: string, meta?: Partial<RewardEntry>) {
    setSelection((prev) => {
      const next = new Map(prev)
      const key = selectionKey(type, id)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, { type, id, count: meta?.count ?? 1 })
      }
      return next
    })
  }

  const selectedCount = selection.size
  const countByType = useMemo(() => {
    const out: Record<RewardType, number> = { item: 0, currency: 0, entity: 0 }
    for (const e of selection.values()) out[e.type] += 1
    return out
  }, [selection])

  function handleConfirm() {
    onConfirm([...selection.values()])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.resource_picker_title()}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as RewardType)}
        >
          {tabs.length > 1 ? (
            <TabsList className="self-start">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {typeLabel(t)}
                  {countByType[t] > 0 ? (
                    <Badge variant="secondary" className="ml-1.5">
                      {countByType[t]}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}

          {tabs.map((t) => (
            <TabsContent key={t} value={t} className="mt-2">
              <ResourceTab
                type={t}
                isActive={activeTab === t}
                selection={selection}
                onToggle={toggle}
              />
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {m.resource_picker_selected_count({ count: selectedCount })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {m.common_cancel()}
            </Button>
            <Button type="button" onClick={handleConfirm}>
              {m.resource_picker_confirm()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Per-type tab body ─────────────────────────────────────────────

interface ResourceTabProps {
  type: RewardType
  isActive: boolean
  selection: Map<string, RewardEntry>
  onToggle: (type: RewardType, id: string) => void
}

function ResourceTab({ type, isActive, selection, onToggle }: ResourceTabProps) {
  const [input, setInput] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(input.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [input])

  const enabled = isActive
  const currencies = useSearchCurrenciesInfinite({
    q: debouncedQ,
    enabled: enabled && type === "currency",
  })
  const items = useSearchItemDefinitionsInfinite({
    q: debouncedQ,
    enabled: enabled && type === "item",
  })
  const entities = useSearchEntityBlueprintsInfinite({
    q: debouncedQ,
    enabled: enabled && type === "entity",
  })

  const query =
    type === "currency" ? currencies : type === "item" ? items : entities

  const rows = useMemo(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap(
      (p) => p.items as (CurrencyDefinition | ItemDefinition | EntityBlueprint)[],
    )
  }, [query.data])

  // IntersectionObserver-based infinite scroll sentinel.
  const sentinelRef = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (!query.hasNextPage) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !query.isFetchingNextPage) {
            void query.fetchNextPage()
          }
        }
      },
      { root: null, rootMargin: "0px 0px 200px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [query, rows.length])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={m.resource_picker_search_placeholder()}
          className="pl-8"
          autoFocus={isActive}
        />
      </div>

      <div className="max-h-[55vh] overflow-y-auto rounded-md border">
        {query.isPending ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <Empty>
            <EmptyTitle>{m.common_failed_to_load({
              resource: typeLabel(type),
              error: (query.error as Error)?.message ?? "",
            })}</EmptyTitle>
          </Empty>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyTitle>{m.resource_picker_empty()}</EmptyTitle>
            <EmptyDescription>
              {debouncedQ ? `“${debouncedQ}”` : ""}
            </EmptyDescription>
          </Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const checked = selection.has(selectionKey(type, row.id))
              return (
                <li key={row.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={checked}
                    onClick={() => onToggle(type, row.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault()
                        onToggle(type, row.id)
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <Checkbox
                      checked={checked}
                      tabIndex={-1}
                      aria-hidden
                    />
                    <ResourceIcon name={row.name} icon={row.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {row.name}
                      </div>
                      {row.alias ? (
                        <code className="text-xs text-muted-foreground">
                          {row.alias}
                        </code>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
            <li ref={sentinelRef} className="px-3 py-2 text-center text-xs text-muted-foreground">
              {query.isFetchingNextPage
                ? m.resource_picker_load_more()
                : query.hasNextPage
                  ? " "
                  : null}
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}

interface ResourceIconProps {
  name: string
  icon: string | null
}

function ResourceIcon({ name, icon }: ResourceIconProps) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border"
      />
    )
  }
  const initial = name.trim().slice(0, 1).toUpperCase() || "?"
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground ring-1 ring-border">
      {initial}
    </div>
  )
}
