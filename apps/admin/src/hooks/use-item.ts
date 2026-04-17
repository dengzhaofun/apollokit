import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
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

export function useItemCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () =>
      api.get<{ items: ItemCategory[] }>("/api/item/categories"),
    select: (data) => data.items,
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

export function useItemDefinitions() {
  return useQuery({
    queryKey: DEFINITIONS_KEY,
    queryFn: () =>
      api.get<{ items: ItemDefinition[] }>("/api/item/definitions"),
    select: (data) => data.items,
  })
}

/**
 * Only definitions flagged isCurrency. Used by features (storage box,
 * shop cost selectors) that must restrict input to currencies.
 */
export function useCurrencies() {
  return useQuery({
    queryKey: [...DEFINITIONS_KEY, "currencies"],
    queryFn: () =>
      api.get<{ items: ItemDefinition[] }>("/api/item/definitions"),
    select: (data) => data.items.filter((d) => d.isCurrency),
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
