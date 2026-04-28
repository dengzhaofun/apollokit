import { useInfiniteQuery } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, type Page } from "#/hooks/use-list-search"
import type { CurrencyDefinition } from "#/lib/types/currency"
import type { ItemDefinition } from "#/lib/types/item"
import type { EntityBlueprint } from "#/lib/types/entity"

interface SearchOpts {
  q?: string
  enabled?: boolean
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 50

function trimQ(q?: string): string | undefined {
  const t = q?.trim()
  return t && t.length > 0 ? t : undefined
}

export function useSearchCurrenciesInfinite(opts: SearchOpts = {}) {
  const q = trimQ(opts.q)
  const limit = opts.pageSize ?? DEFAULT_PAGE_SIZE
  return useInfiniteQuery({
    queryKey: ["currency-definitions", "search", { q: q ?? "", limit }],
    queryFn: ({ pageParam }) =>
      api.get<Page<CurrencyDefinition>>(
        `/api/currency/definitions?${buildQs({
          cursor: pageParam,
          limit,
          q,
        })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
  })
}

export function useSearchItemDefinitionsInfinite(opts: SearchOpts = {}) {
  const q = trimQ(opts.q)
  const limit = opts.pageSize ?? DEFAULT_PAGE_SIZE
  return useInfiniteQuery({
    queryKey: ["item-definitions", "search", { q: q ?? "", limit }],
    queryFn: ({ pageParam }) =>
      api.get<Page<ItemDefinition>>(
        `/api/item/definitions?${buildQs({
          cursor: pageParam,
          limit,
          q,
        })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
  })
}

export function useSearchEntityBlueprintsInfinite(opts: SearchOpts = {}) {
  const q = trimQ(opts.q)
  const limit = opts.pageSize ?? DEFAULT_PAGE_SIZE
  return useInfiniteQuery({
    queryKey: ["entity-blueprints", "search", { q: q ?? "", limit }],
    queryFn: ({ pageParam }) =>
      api.get<Page<EntityBlueprint>>(
        `/api/entity/blueprints?${buildQs({
          cursor: pageParam,
          limit,
          q,
        })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
  })
}
