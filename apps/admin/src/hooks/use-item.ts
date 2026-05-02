import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  ItemCategory,
  ItemDefinition,
  InventoryView,
  GrantResult,
  DeductResult,
  BalanceResult,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateDefinitionInput,
  UpdateDefinitionInput,
  GrantItemsInput,
  DeductItemsInput,
} from "#/lib/types/item"

const CATEGORIES_KEY = ["item-categories"] as const
const DEFINITIONS_KEY = ["item-definitions"] as const

// ─── Categories ───────────────────────────────────────────────────

// Item categories has no extra filters server-side beyond `q`; the
// faceted toolbar is empty and the Advanced toggle is hidden.
export const ITEM_CATEGORY_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated item categories list — URL-driven via `useListSearch`.
 * Pass the route handle so search/cursor/pageSize land in URL search
 * params (refresh-safe, shareable).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useItemCategories(route: any) {
  return useListSearch<ItemCategory>({
    route,
    queryKey: CATEGORIES_KEY,
    filterDefs: ITEM_CATEGORY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<ItemCategory>>(
        `/api/item/categories?${qs({ cursor, limit, q })}`,
      ),
  })
}

/**
 * Non-paginated convenience for form dropdowns / selectors that need
 * "all categories at once". Fetches a single page at the server cap
 * (200). Tenants with more than 200 categories should switch to a
 * typeahead combobox instead.
 */
export function useAllItemCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<ItemCategory>>(`/api/item/categories?${qs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useItemCategory(key: string) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, key],
    queryFn: () => api.get<ItemCategory>(`/api/item/categories/${key}`),
    enabled: !!key,
  })
}

export function useCreateItemCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<ItemCategory>("/api/item/categories", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useUpdateItemCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCategoryInput & { id: string }) =>
      api.patch<ItemCategory>(`/api/item/categories/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useDeleteItemCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/item/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

// ─── Definitions ──────────────────────────────────────────────────

/**
 * Item definitions filter defs. Mirrors the server's
 * `itemDefinitionFilters` declaration; the categoryId values come from
 * `useAllItemCategories()` at the call site so the dropdown is populated
 * with the actual categories available in the current org.
 */
export function buildItemDefinitionFilterDefs(
  categories: { id: string; name: string }[] | undefined,
): FilterDef[] {
  return [
    {
      id: "categoryId",
      label: "Category",
      type: "select",
      options: (categories ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    },
  ]
}

/**
 * URL-driven item definitions list. Default scope: permanent /
 * non-activity-bound only — activity-scoped items are managed inside
 * the activity's detail page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useItemDefinitions(route: any, filterDefs: FilterDef[]) {
  return useListSearch<ItemDefinition>({
    route,
    queryKey: DEFINITIONS_KEY,
    filterDefs,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<ItemDefinition>>(
        `/api/item/definitions?${qs({
          cursor,
          limit,
          q,
          adv,
          activityId: "null",
          ...filters,
        })}`,
      ),
  })
}

/**
 * Non-paginated convenience for selectors. Same caveat as
 * `useAllItemCategories` — capped at 200 server-side.
 */
export function useAllItemDefinitions(opts: { categoryId?: string } = {}) {
  const { categoryId } = opts
  return useQuery({
    queryKey: [...DEFINITIONS_KEY, "all", { categoryId: categoryId ?? null }],
    queryFn: () =>
      api
        .get<Page<ItemDefinition>>(
          `/api/item/definitions?${qs({ limit: 200, categoryId })}`,
        )
        .then((p) => p.items),
  })
}

export function useItemDefinition(key: string) {
  return useQuery({
    queryKey: [...DEFINITIONS_KEY, key],
    queryFn: () => api.get<ItemDefinition>(`/api/item/definitions/${key}`),
    enabled: !!key,
  })
}

export function useCreateItemDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDefinitionInput) =>
      api.post<ItemDefinition>("/api/item/definitions", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useUpdateItemDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateDefinitionInput & { id: string }) =>
      api.patch<ItemDefinition>(`/api/item/definitions/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useDeleteItemDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/item/definitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

// ─── Inventory / Balance ──────────────────────────────────────────

export function useUserInventory(endUserId: string, definitionId?: string) {
  return useQuery({
    queryKey: ["item-inventory", endUserId, definitionId],
    queryFn: () => {
      const params = definitionId ? `?definitionId=${definitionId}` : ""
      return api.get<{ items: InventoryView[] }>(
        `/api/item/users/${endUserId}/inventory${params}`,
      )
    },
    select: (data) => data.items,
    enabled: !!endUserId,
  })
}

export function useUserBalance(endUserId: string, key: string) {
  return useQuery({
    queryKey: ["item-balance", endUserId, key],
    queryFn: () =>
      api.get<BalanceResult>(`/api/item/users/${endUserId}/balance/${key}`),
    enabled: !!endUserId && !!key,
  })
}

// ─── Grant / Deduct ───────────────────────────────────────────────

export function useGrantItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GrantItemsInput) =>
      api.post<GrantResult>("/api/item/grant", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item-inventory"] })
      qc.invalidateQueries({ queryKey: ["item-balance"] })
    },
  })
}

export function useDeductItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DeductItemsInput) =>
      api.post<DeductResult>("/api/item/deduct", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item-inventory"] })
      qc.invalidateQueries({ queryKey: ["item-balance"] })
    },
  })
}
