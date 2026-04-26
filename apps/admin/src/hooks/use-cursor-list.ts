/**
 * Generic cursor-paginated list hook.
 *
 * Wraps tanstack-query for the standard server contract documented in
 * `apps/server/src/lib/pagination.ts`:
 *
 *   request:  ?cursor=<opaque> &limit=N &q=<search>
 *   response: { items, nextCursor }
 *
 * Manages a cursor stack so the user can navigate forwards (push the
 * incoming nextCursor) and backwards (pop the stack). Search input is
 * debounced — typing in the search box doesn't fire a request per
 * keystroke.
 *
 * Usage:
 *
 *   const list = useCursorList<ItemCategory>({
 *     queryKey: ["item-categories"],
 *     fetchPage: ({ cursor, limit, q }) =>
 *       api.get<Page<ItemCategory>>(
 *         `/api/item/categories?` +
 *           qs({ cursor, limit, q }),
 *       ),
 *   })
 *
 *   <DataTable
 *     data={list.items}
 *     pageIndex={list.pageIndex}
 *     canPrev={list.canPrev}
 *     canNext={list.canNext}
 *     onNextPage={list.nextPage}
 *     onPrevPage={list.prevPage}
 *     pageSize={list.pageSize}
 *     onPageSizeChange={list.setPageSize}
 *     searchValue={list.searchInput}
 *     onSearchChange={list.setSearchInput}
 *     isLoading={list.isLoading}
 *     columns={...}
 *   />
 */

import { useQuery, type QueryKey } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"

export type Page<T> = {
  items: T[]
  nextCursor: string | null
}

type FetchPageArgs = {
  cursor?: string
  limit: number
  q?: string
}

interface Options<T> {
  /**
   * Stable query-key prefix (the cursor / page-size / q are appended
   * automatically). Pass anything you'd pass to `useQuery`'s queryKey.
   */
  queryKey: QueryKey
  fetchPage: (args: FetchPageArgs) => Promise<Page<T>>
  /** Initial page size (default 50). Persists across pagination. */
  initialPageSize?: number
  /** Search debounce in ms (default 250). */
  searchDebounceMs?: number
  /** When false, the query is paused — useful for `enabled`-style guards. */
  enabled?: boolean
}

interface UseCursorListReturn<T> {
  items: T[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void

  pageIndex: number
  canPrev: boolean
  canNext: boolean
  nextPage: () => void
  prevPage: () => void

  pageSize: number
  setPageSize: (size: number) => void

  /**
   * What's currently typed into the search box (echoed back to the
   * input for controlled rendering). Updated synchronously on every
   * keystroke; the actual fetch only kicks once `searchDebounceMs`
   * has elapsed since the last change.
   */
  searchInput: string
  setSearchInput: (value: string) => void
}

const DEFAULT_PAGE_SIZE = 50
const DEFAULT_SEARCH_DEBOUNCE_MS = 250

export function useCursorList<T>({
  queryKey,
  fetchPage,
  initialPageSize = DEFAULT_PAGE_SIZE,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  enabled = true,
}: Options<T>): UseCursorListReturn<T> {
  // Cursor stack: each entry is the cursor for one page.
  // Index 0 is undefined (= first page, no cursor).
  // pageIndex (1-based) corresponds to stack[pageIndex - 1].
  const [stack, setStack] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  // Search: split user input from debounced "applied" value
  const [searchInput, setSearchInputState] = useState("")
  const [appliedQ, setAppliedQ] = useState("")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAppliedQ(searchInput.trim())
    }, searchDebounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput, searchDebounceMs])

  // When q or pageSize changes, reset cursor stack to first page
  // — old cursors are no longer valid against the filtered/resized result set.
  useEffect(() => {
    setStack([undefined])
    setPageIndex(1)
    // intentionally only on q / pageSize change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ, pageSize])

  const cursor = stack[pageIndex - 1]

  const query = useQuery({
    queryKey: [...queryKey, { cursor: cursor ?? null, limit: pageSize, q: appliedQ || null }],
    queryFn: () =>
      fetchPage({
        cursor,
        limit: pageSize,
        q: appliedQ || undefined,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })

  const nextPage = () => {
    const nextCursor = query.data?.nextCursor
    if (!nextCursor) return
    // If we already pushed beyond this page (user prev'd then nexted),
    // overwrite stack from current index forward to keep it consistent.
    setStack((prev) => {
      const truncated = prev.slice(0, pageIndex)
      return [...truncated, nextCursor]
    })
    setPageIndex((i) => i + 1)
  }

  const prevPage = () => {
    if (pageIndex <= 1) return
    setPageIndex((i) => i - 1)
  }

  const setPageSize = (size: number) => {
    setPageSizeState(size)
  }

  const setSearchInput = (value: string) => {
    setSearchInputState(value)
  }

  const items = useMemo(() => query.data?.items ?? [], [query.data])

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
  }
}

/**
 * Helper: build a query string from a flat object, dropping
 * `undefined` / `null` / `""` values. Use at the route call site.
 *
 *   api.get(`/api/item/categories?` + qs({ cursor, limit, q }))
 */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue
    usp.set(k, String(v))
  }
  return usp.toString()
}
