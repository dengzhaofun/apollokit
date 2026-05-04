/**
 * URL-bound list-page hook — drives every list route in admin.
 *
 * Source of truth = URL search params (via TanStack Router). All page
 * state — search term, cursor, page size, filter values, advanced AST,
 * basic/advanced mode — lives in the URL so:
 *   - refresh keeps the page state
 *   - back-button restores the previous filter / page
 *   - the URL is shareable end-to-end
 *
 * Cursor stack is still maintained in component state for the prev/next
 * buttons (so we can pop back rather than re-deriving every cursor),
 * but the *current* cursor is always taken from the URL.
 *
 * Invariant — any change to filters / search / pageSize / mode /
 * advanced clears `cursor`. Old cursors decode to a `(createdAt, id)`
 * pair that may not exist in the new result set; reusing one yields
 * undefined behavior. Enforced inside the setters here so call sites
 * can't forget.
 *
 * Search input is mirrored locally for controlled rendering and the
 * URL write is debounced (250ms by default) — typing in the search
 * box does NOT push a history entry per keystroke.
 *
 * The hook does NOT know about the wire format of any filter — it
 * just reads/writes URL keys by name. Per-module callers pass a
 * `filterDefs` array describing the keys they own; the hook
 * extracts/updates those keys verbatim. This keeps the hook decoupled
 * from each module's filter shape (and from server-side `defineListFilter`).
 */

import { type AnyRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, type QueryKey } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  RESET_LIST_SEARCH,
  type ListSearch,
} from "#/lib/list-search"

// ─── Filter definitions (shared with DataTable.tsx) ──────────────────

export type FilterOption = { value: string; label: string }

export type FilterDef =
  | {
      id: string
      label: string
      type: "select"
      options: FilterOption[]
    }
  | {
      id: string
      label: string
      type: "multiselect"
      options: FilterOption[]
    }
  | {
      id: string
      label: string
      type: "boolean"
      /** Optional override labels for true/false (defaults: True/False). */
      trueLabel?: string
      falseLabel?: string
    }
  | {
      id: string
      label: string
      type: "dateRange"
    }
  | {
      id: string
      label: string
      type: "numberRange"
    }

/**
 * The runtime value shape per filter type, as exposed back to call
 * sites and to fetchPage. `undefined` = not applied.
 */
export type FilterValue =
  | { type: "select"; value: string | undefined }
  | { type: "multiselect"; value: string[] | undefined }
  | { type: "boolean"; value: boolean | undefined }
  | { type: "dateRange"; value: { gte?: string; lte?: string } | undefined }
  | { type: "numberRange"; value: { gte?: number; lte?: number } | undefined }

/**
 * Flat key/value map of the current filter state, suitable for
 * `URLSearchParams` — multiselect collapses to comma string, dateRange
 * splits into `${id}Gte` / `${id}Lte`.
 */
export type FlatFilterParams = Record<string, string | undefined>

// ─── Hook contract ───────────────────────────────────────────────────

export type Page<T> = {
  items: T[]
  nextCursor: string | null
}

export type FetchPageArgs = {
  cursor?: string
  limit: number
  q?: string
  /** Flat query params from `flattenFilters(...)` — already URL-ready. */
  filters: FlatFilterParams
  /** Advanced AST as base64url JSON (only set when mode === "advanced"). */
  adv?: string
}

interface Options<T> {
  /** TanStack Router Route — for `Route.useSearch()` + `Route.fullPath`. */
  route: AnyRoute
  queryKey: QueryKey
  filterDefs: FilterDef[]
  fetchPage: (args: FetchPageArgs) => Promise<Page<T>>
  initialPageSize?: number
  searchDebounceMs?: number
  enabled?: boolean
}

export interface UseListSearchReturn<T> {
  // ─── Data ──────────────────────────────────────────────────────────
  items: T[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void

  // ─── Pagination ────────────────────────────────────────────────────
  pageIndex: number
  canPrev: boolean
  canNext: boolean
  nextPage: () => void
  prevPage: () => void
  pageSize: number
  setPageSize: (size: number) => void

  // ─── Search ────────────────────────────────────────────────────────
  searchInput: string
  setSearchInput: (value: string) => void

  // ─── Mode (basic | advanced) ───────────────────────────────────────
  mode: "basic" | "advanced"
  setMode: (mode: "basic" | "advanced") => void

  // ─── Basic filters ─────────────────────────────────────────────────
  /** Current filter values keyed by filter id. */
  filters: Record<string, FilterValue["value"]>
  setFilter: (id: string, value: FilterValue["value"]) => void
  resetFilters: () => void
  /** True when at least one filter has a non-empty value. */
  hasActiveFilters: boolean
  /** Number of currently-active filter ids (for badge display). */
  activeFilterCount: number

  // ─── Advanced AST ──────────────────────────────────────────────────
  advanced: unknown | undefined
  setAdvanced: (ast: unknown | undefined) => void

  /**
   * Pre-built bundle of props the standard `<DataTable />` consumes
   * for pagination / search / mode. Spread it directly into the
   * component to keep the call site tiny.
   */
  tableProps: {
    pageIndex: number
    canPrev: boolean
    canNext: boolean
    onNextPage: () => void
    onPrevPage: () => void
    pageSize: number
    onPageSizeChange: (size: number) => void
    searchValue: string
    onSearchChange: (value: string) => void
    isLoading: boolean
  }
}

const DEFAULT_PAGE_SIZE = 50
const DEFAULT_SEARCH_DEBOUNCE_MS = 250

/**
 * Read filter values out of the URL search object.
 * Returns one entry per filter id; undefined for unset filters.
 */
function readFilters(
  defs: FilterDef[],
  search: ListSearch,
): Record<string, FilterValue["value"]> {
  const out: Record<string, FilterValue["value"]> = {}
  for (const def of defs) {
    switch (def.type) {
      case "select": {
        const v = search[def.id]
        out[def.id] = typeof v === "string" && v !== "" ? v : undefined
        break
      }
      case "multiselect": {
        const v = search[def.id]
        if (typeof v === "string" && v !== "") {
          out[def.id] = v.split(",").map((s) => s.trim()).filter(Boolean)
        } else {
          out[def.id] = undefined
        }
        break
      }
      case "boolean": {
        const v = search[def.id]
        if (v === true || v === "true") out[def.id] = true
        else if (v === false || v === "false") out[def.id] = false
        else out[def.id] = undefined
        break
      }
      case "dateRange": {
        const gte = search[`${def.id}Gte`]
        const lte = search[`${def.id}Lte`]
        if (
          (typeof gte === "string" && gte !== "") ||
          (typeof lte === "string" && lte !== "")
        ) {
          out[def.id] = {
            gte: typeof gte === "string" ? gte : undefined,
            lte: typeof lte === "string" ? lte : undefined,
          }
        } else {
          out[def.id] = undefined
        }
        break
      }
      case "numberRange": {
        const gte = search[`${def.id}Gte`]
        const lte = search[`${def.id}Lte`]
        const gteNum = typeof gte === "string" ? Number(gte) : undefined
        const lteNum = typeof lte === "string" ? Number(lte) : undefined
        if (
          (gteNum !== undefined && Number.isFinite(gteNum)) ||
          (lteNum !== undefined && Number.isFinite(lteNum))
        ) {
          out[def.id] = {
            gte: Number.isFinite(gteNum) ? gteNum : undefined,
            lte: Number.isFinite(lteNum) ? lteNum : undefined,
          }
        } else {
          out[def.id] = undefined
        }
        break
      }
    }
  }
  return out
}

/**
 * Convert the live filters map back into the URL key/value patch
 * suitable for `setSearch(...)`. dateRange/numberRange split into
 * `Gte`/`Lte` keys; `undefined` values clear the URL key.
 */
function flattenFilterValueToPatch(
  def: FilterDef,
  value: FilterValue["value"],
): Record<string, string | undefined> {
  switch (def.type) {
    case "select":
      return { [def.id]: typeof value === "string" ? value : undefined }
    case "multiselect": {
      const arr = Array.isArray(value) ? value : undefined
      return {
        [def.id]: arr && arr.length > 0 ? arr.join(",") : undefined,
      }
    }
    case "boolean":
      return {
        [def.id]:
          value === true ? "true" : value === false ? "false" : undefined,
      }
    case "dateRange": {
      const v = value as { gte?: string; lte?: string } | undefined
      return {
        [`${def.id}Gte`]: v?.gte || undefined,
        [`${def.id}Lte`]: v?.lte || undefined,
      }
    }
    case "numberRange": {
      const v = value as { gte?: number; lte?: number } | undefined
      return {
        [`${def.id}Gte`]:
          v?.gte !== undefined && Number.isFinite(v.gte) ? String(v.gte) : undefined,
        [`${def.id}Lte`]:
          v?.lte !== undefined && Number.isFinite(v.lte) ? String(v.lte) : undefined,
      }
    }
  }
}

/**
 * Build the FlatFilterParams sent to fetchPage. Uses the same key
 * convention as the URL contract (and the server-side defineListFilter):
 * `${id}` for single values, `${id}Gte`/`${id}Lte` for ranges,
 * comma-joined strings for multiselect.
 */
function flattenFilters(
  defs: FilterDef[],
  values: Record<string, FilterValue["value"]>,
): FlatFilterParams {
  const out: FlatFilterParams = {}
  for (const def of defs) {
    Object.assign(out, flattenFilterValueToPatch(def, values[def.id]))
  }
  return out
}

/** Keys this filterDefs array owns in the URL. */
function ownedFilterKeys(defs: FilterDef[]): string[] {
  const keys: string[] = []
  for (const def of defs) {
    if (def.type === "dateRange" || def.type === "numberRange") {
      keys.push(`${def.id}Gte`, `${def.id}Lte`)
    } else {
      keys.push(def.id)
    }
  }
  return keys
}

export function useListSearch<T>({
  route,
  queryKey,
  filterDefs,
  fetchPage,
  initialPageSize = DEFAULT_PAGE_SIZE,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  enabled = true,
}: Options<T>): UseListSearchReturn<T> {
  const search = route.useSearch() as ListSearch
  const navigate = useNavigate({ from: route.fullPath })

  // Cursor stack: page N's cursor lives at index N-1. Index 0 is
  // undefined (= first page). We push when navigating forward, pop
  // when going back. Page 1 = no cursor in URL.
  const [stack, setStack] = useState<(string | undefined)[]>([undefined])

  // Search input echo — kept locally for controlled rendering.
  // Initialise from URL on first mount; subsequent URL changes from
  // outside (back/forward, paste) sync via the effect below.
  const [searchInput, setSearchInputState] = useState<string>(search.q ?? "")
  const lastSyncedQ = useRef<string | undefined>(search.q ?? "")
  useEffect(() => {
    // Sync local input only when the URL `q` changes from outside —
    // not when our own debounced write is the cause.
    if ((search.q ?? "") !== lastSyncedQ.current) {
      setSearchInputState(search.q ?? "")
      lastSyncedQ.current = search.q ?? ""
    }
  }, [search.q])

  // Debounce search → URL write
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = searchInput.trim()
    const current = (search.q ?? "").trim()
    if (trimmed === current) return
    debounceRef.current = setTimeout(() => {
      lastSyncedQ.current = trimmed
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          q: trimmed === "" ? undefined : trimmed,
          cursor: undefined, // q change resets pagination
        }) as never,
        replace: true,
      })
    }, searchDebounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput, search.q, searchDebounceMs, navigate])

  // Pagination
  const pageIndex = stack.findIndex((c) => c === search.cursor) + 1 || 1
  const cursor = search.cursor
  const pageSize = search.pageSize ?? initialPageSize
  const mode: "basic" | "advanced" = search.mode === "advanced" ? "advanced" : "basic"

  // Filter values + advanced AST
  const filters = useMemo(
    () => readFilters(filterDefs, search),
    [filterDefs, search],
  )
  const filterParams = useMemo(
    () => flattenFilters(filterDefs, filters),
    [filterDefs, filters],
  )
  const advanced = useMemo(() => {
    if (!search.adv) return undefined
    try {
      const padded = search.adv.replace(/-/g, "+").replace(/_/g, "/")
      const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
      return JSON.parse(atob(padded + padding))
    } catch {
      return undefined
    }
  }, [search.adv])

  // ─── Query ─────────────────────────────────────────────────────────
  const queryParams = mode === "advanced"
    ? { cursor, limit: pageSize, q: search.q, filters: {}, adv: search.adv }
    : { cursor, limit: pageSize, q: search.q, filters: filterParams, adv: undefined }

  const query = useQuery({
    queryKey: [...queryKey, queryParams],
    queryFn: () =>
      fetchPage({
        cursor,
        limit: pageSize,
        q: search.q || undefined,
        filters: queryParams.filters,
        adv: queryParams.adv,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })

  const items = useMemo(() => query.data?.items ?? [], [query.data])

  // ─── Setters ───────────────────────────────────────────────────────

  // Centralised URL writer — every setter uses this so the cursor-reset
  // invariant is enforced in one place.
  const updateSearch = useCallback(
    (patch: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, ...patch }
          // Drop keys explicitly set to undefined so URL stays clean.
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete next[k]
          }
          return next
        },
        replace: false,
      })
    },
    [navigate],
  )

  const setSearchInput = useCallback((value: string) => {
    setSearchInputState(value)
  }, [])

  const setPageSize = useCallback(
    (size: number) => {
      setStack([undefined])
      updateSearch({ pageSize: size, cursor: undefined })
    },
    [updateSearch],
  )

  const setFilter = useCallback(
    (id: string, value: FilterValue["value"]) => {
      const def = filterDefs.find((d) => d.id === id)
      if (!def) return
      const patch = flattenFilterValueToPatch(def, value)
      setStack([undefined])
      updateSearch({ ...patch, cursor: undefined })
    },
    [filterDefs, updateSearch],
  )

  const resetFilters = useCallback(() => {
    const patch: Record<string, undefined> = { cursor: undefined }
    for (const k of ownedFilterKeys(filterDefs)) patch[k] = undefined
    setStack([undefined])
    updateSearch(patch)
  }, [filterDefs, updateSearch])

  const setMode = useCallback(
    (next: "basic" | "advanced") => {
      // Mode swap clears the OTHER side's params to avoid ambiguity.
      const patch: Record<string, string | undefined> = {
        mode: next === "advanced" ? "advanced" : undefined,
        cursor: undefined,
      }
      if (next === "basic") {
        patch.adv = undefined
      } else {
        for (const k of ownedFilterKeys(filterDefs)) patch[k] = undefined
      }
      setStack([undefined])
      updateSearch(patch)
    },
    [filterDefs, updateSearch],
  )

  const setAdvanced = useCallback(
    (ast: unknown | undefined) => {
      let encoded: string | undefined
      if (ast && typeof ast === "object") {
        const json = JSON.stringify(ast)
        const utf8 = new TextEncoder().encode(json)
        let bin = ""
        for (const b of utf8) bin += String.fromCharCode(b)
        encoded = btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
      }
      setStack([undefined])
      updateSearch({ adv: encoded, cursor: undefined })
    },
    [updateSearch],
  )

  const nextPage = useCallback(() => {
    const next = query.data?.nextCursor
    if (!next) return
    setStack((prev) => {
      const idx = prev.findIndex((c) => c === cursor)
      const truncated = prev.slice(0, idx + 1)
      return [...truncated, next]
    })
    updateSearch({ cursor: next })
  }, [cursor, query.data?.nextCursor, updateSearch])

  const prevPage = useCallback(() => {
    setStack((prev) => {
      const idx = prev.findIndex((c) => c === cursor)
      if (idx <= 0) return prev
      // Stay in the stack (don't pop) — back/forward should still work.
      const prevCursor = prev[idx - 1]
      updateSearch({ cursor: prevCursor })
      return prev
    })
  }, [cursor, updateSearch])

  const activeFilterCount = useMemo(() => {
    let n = 0
    for (const def of filterDefs) {
      const v = filters[def.id]
      if (v === undefined) continue
      if (Array.isArray(v) && v.length === 0) continue
      if (typeof v === "object" && v !== null) {
        const hasAny = Object.values(v).some((x) => x !== undefined)
        if (!hasAny) continue
      }
      n += 1
    }
    return n
  }, [filterDefs, filters])

  const reset = useMemo(() => RESET_LIST_SEARCH, [])
  void reset // re-export indirection (keeps import alive across edits)

  return {
    items,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),

    pageIndex,
    canPrev: pageIndex > 1,
    canNext: !!query.data?.nextCursor,
    nextPage,
    prevPage,
    pageSize,
    setPageSize,

    searchInput,
    setSearchInput,

    mode,
    setMode,

    filters,
    setFilter,
    resetFilters,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,

    advanced,
    setAdvanced,

    tableProps: {
      pageIndex,
      canPrev: pageIndex > 1,
      canNext: !!query.data?.nextCursor,
      onNextPage: nextPage,
      onPrevPage: prevPage,
      pageSize,
      onPageSizeChange: setPageSize,
      searchValue: searchInput,
      onSearchChange: setSearchInput,
      isLoading: query.isPending,
    },
  }
}

/**
 * Helper: build a query string from a flat object, dropping undefined
 * / null / empty values. Use at the route call site:
 *
 *   api.get(`/api/v1/end-user?${qs({ cursor, limit, q, ...filters })}`)
 *
 * Re-exported here so call sites don't need to import from the legacy
 * sibling URL helpers.
 */
export function qs(
  params: Record<string, string | number | undefined | null>,
): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue
    usp.set(k, String(v))
  }
  return usp.toString()
}
