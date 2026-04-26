import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateShopCategoryInput,
  CreateShopGrowthStageInput,
  CreateShopProductInput,
  CreateShopTagInput,
  ShopCategory,
  ShopCategoryNode,
  ShopClaimStageInput,
  ShopClaimStageResult,
  ShopGrowthStage,
  ShopListProductsQuery,
  ShopListUserProductsQuery,
  ShopProduct,
  ShopPurchaseInput,
  ShopPurchaseResult,
  ShopTag,
  ShopUserProductView,
  UpdateShopCategoryInput,
  UpdateShopGrowthStageInput,
  UpdateShopProductInput,
  UpdateShopTagInput,
} from "#/lib/types/shop"

const CATEGORIES_KEY = ["shop-categories"] as const
const CATEGORY_TREE_KEY = ["shop-categories", "tree"] as const
const TAGS_KEY = ["shop-tags"] as const
const PRODUCTS_KEY = ["shop-products"] as const
const STAGES_KEY = ["shop-stages"] as const

// ─── Categories ──────────────────────────────────────────────────

export function useShopCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api.get<{ items: ShopCategory[] }>("/api/shop/categories"),
    select: (data) => data.items,
  })
}

export function useShopCategoryTree() {
  return useQuery({
    queryKey: CATEGORY_TREE_KEY,
    queryFn: () =>
      api.get<{ items: ShopCategoryNode[] }>("/api/shop/categories/tree"),
    select: (data) => data.items,
  })
}

export function useShopCategory(key: string) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, key],
    queryFn: () => api.get<ShopCategory>(`/api/shop/categories/${key}`),
    enabled: !!key,
  })
}

export function useCreateShopCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateShopCategoryInput) =>
      api.post<ShopCategory>("/api/shop/categories", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      qc.invalidateQueries({ queryKey: CATEGORY_TREE_KEY })
    },
  })
}

export function useUpdateShopCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateShopCategoryInput & { id: string }) =>
      api.patch<ShopCategory>(`/api/shop/categories/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      qc.invalidateQueries({ queryKey: CATEGORY_TREE_KEY })
    },
  })
}

export function useDeleteShopCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/shop/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      qc.invalidateQueries({ queryKey: CATEGORY_TREE_KEY })
    },
  })
}

// ─── Tags ────────────────────────────────────────────────────────

/** Paginated tags — for the admin TagTable. */
export function useShopTags(initialPageSize = 50) {
  return useCursorList<ShopTag>({
    queryKey: TAGS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<ShopTag>>(`/api/shop/tags?${buildQs({ cursor, limit, q })}`),
    initialPageSize,
  })
}

/** Non-paginated all-tags fetch for selectors (200 cap). */
export function useAllShopTags() {
  return useQuery({
    queryKey: [...TAGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<ShopTag>>(`/api/shop/tags?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useShopTag(key: string) {
  return useQuery({
    queryKey: [...TAGS_KEY, key],
    queryFn: () => api.get<ShopTag>(`/api/shop/tags/${key}`),
    enabled: !!key,
  })
}

export function useCreateShopTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateShopTagInput) =>
      api.post<ShopTag>("/api/shop/tags", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}

export function useUpdateShopTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateShopTagInput & { id: string }) =>
      api.patch<ShopTag>(`/api/shop/tags/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}

export function useDeleteShopTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/shop/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  })
}

// ─── Products ────────────────────────────────────────────────────

type ShopProductFilterRest = Omit<ShopListProductsQuery, "limit" | "cursor" | "q">

/** Paginated products — for the admin ProductTable. */
export function useShopProducts(
  filter: ShopProductFilterRest & { initialPageSize?: number } = {},
) {
  const { initialPageSize = 50, ...rest } = filter
  return useCursorList<ShopProduct>({
    queryKey: [...PRODUCTS_KEY, rest],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<ShopProduct>>(
        `/api/shop/products?${buildQs({
          cursor,
          limit,
          q,
          categoryId: rest.categoryId,
          tagId: rest.tagId,
          productType: rest.productType,
          isActive:
            rest.isActive == null ? undefined : String(rest.isActive),
          includeDescendantCategories: rest.includeDescendantCategories
            ? "true"
            : undefined,
          activityId: rest.activityId,
          includeActivity: rest.includeActivity ? "true" : undefined,
        })}`,
      ),
    initialPageSize,
  })
}

export function useShopProduct(key: string) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, "detail", key],
    queryFn: () => api.get<ShopProduct>(`/api/shop/products/${key}`),
    enabled: !!key,
  })
}

export function useCreateShopProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateShopProductInput) =>
      api.post<ShopProduct>("/api/shop/products", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

export function useUpdateShopProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateShopProductInput & { id: string }) =>
      api.patch<ShopProduct>(`/api/shop/products/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

export function useDeleteShopProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/shop/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

// ─── Growth stages ──────────────────────────────────────────────

export function useShopStages(productId: string) {
  return useQuery({
    queryKey: [...STAGES_KEY, productId],
    queryFn: () =>
      api.get<{ items: ShopGrowthStage[] }>(
        `/api/shop/products/${productId}/stages`,
      ),
    select: (data) => data.items,
    enabled: !!productId,
  })
}

export function useCreateShopStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      productId,
      ...input
    }: CreateShopGrowthStageInput & { productId: string }) =>
      api.post<ShopGrowthStage>(
        `/api/shop/products/${productId}/stages`,
        input,
      ),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: [...STAGES_KEY, vars.productId] }),
  })
}

export function useUpdateShopStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      stageId,
      ...input
    }: UpdateShopGrowthStageInput & { stageId: string }) =>
      api.patch<ShopGrowthStage>(`/api/shop/stages/${stageId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAGES_KEY }),
  })
}

export function useDeleteShopStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stageId: string) => api.delete(`/api/shop/stages/${stageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAGES_KEY }),
  })
}

// ─── Execution (admin acts on behalf of end user) ───────────────

export function usePurchaseShopProduct() {
  return useMutation({
    mutationFn: ({
      productId,
      ...input
    }: ShopPurchaseInput & { productId: string }) =>
      api.post<ShopPurchaseResult>(
        `/api/shop/products/${productId}/purchase`,
        input,
      ),
  })
}

export function useClaimShopStage() {
  return useMutation({
    mutationFn: ({
      endUserId,
      stageId,
      ...input
    }: ShopClaimStageInput & { endUserId: string; stageId: string }) =>
      api.post<ShopClaimStageResult>(
        `/api/shop/users/${endUserId}/stages/${stageId}/claim`,
        input,
      ),
  })
}

function buildUserProductsQueryString(
  query: ShopListUserProductsQuery,
): string {
  const params = new URLSearchParams()
  if (query.categoryId) params.set("categoryId", query.categoryId)
  if (query.tagId) params.set("tagId", query.tagId)
  if (query.productType) params.set("productType", query.productType)
  const s = params.toString()
  return s ? `?${s}` : ""
}

export function useShopUserProducts(
  endUserId: string,
  query: ShopListUserProductsQuery = {},
) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, "user", endUserId, query],
    queryFn: () =>
      api.get<{ items: ShopUserProductView[] }>(
        `/api/shop/users/${endUserId}/products${buildUserProductsQueryString(query)}`,
      ),
    select: (data) => data.items,
    enabled: !!endUserId,
  })
}
