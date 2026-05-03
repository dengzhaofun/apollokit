/**
 * One-stop hook collection for the unified "move" API across every
 * sortable resource.
 *
 * Server contract: every sortable resource exposes
 *   POST /api/<module>/<resource>/{id-or-key}/move
 * with body `{ before: id } | { after: id } | { position: "first" | "last" }`.
 *
 * The four admin interactions (drag-drop / move-to-top / move-to-bottom /
 * ▲▼ neighbour swap) all collapse onto this single endpoint. The
 * shared `MoveBody` type comes from `components/common/SortableList`.
 *
 * Each `useMoveX` here:
 *   - issues the POST
 *   - invalidates the relevant list query keys on success
 * so the caller just plumbs `{ id, body }` through and lets the cache
 * heal. Pair with `<SortableList>` for full DnD UX.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { MoveBody } from "#/components/common/SortableList"
import { api } from "#/lib/api-client"

// ─── Helper for plain (no-side-key) modules ───────────────────────────

function makeMoveHook(opts: {
  endpoint: (id: string) => string
  invalidate: (qc: ReturnType<typeof useQueryClient>) => void
}) {
  return function useMoveX() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: MoveBody }) =>
        api.post(opts.endpoint(id), body),
      onSuccess: () => opts.invalidate(qc),
    })
  }
}

// ─── Currency ─────────────────────────────────────────────────────────

export const useMoveCurrency = makeMoveHook({
  endpoint: (key) => `/api/v1/currency/definitions/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["currency"] }),
})

// ─── Item ─────────────────────────────────────────────────────────────

export const useMoveItemCategory = makeMoveHook({
  endpoint: (key) => `/api/v1/item/categories/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["item-categories"] }),
})

// ─── Storage box ──────────────────────────────────────────────────────

export const useMoveStorageBoxConfig = makeMoveHook({
  endpoint: (id) => `/api/v1/storage-box/configs/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["storage-box"] }),
})

// ─── Friend gift ──────────────────────────────────────────────────────

export const useMoveFriendGiftPackage = makeMoveHook({
  endpoint: (id) => `/api/v1/friend-gift/packages/${id}/move`,
  invalidate: (qc) =>
    qc.invalidateQueries({ queryKey: ["friend-gift-packages"] }),
})

// ─── Exchange ─────────────────────────────────────────────────────────

export const useMoveExchangeOption = makeMoveHook({
  endpoint: (id) => `/api/v1/exchange/options/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["exchange-options"] }),
})

// ─── Badge ────────────────────────────────────────────────────────────

export const useMoveBadgeNode = makeMoveHook({
  endpoint: (id) => `/api/v1/badge/nodes/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["badge"] }),
})

// ─── Entity ───────────────────────────────────────────────────────────

export const useMoveEntitySchema = makeMoveHook({
  endpoint: (key) => `/api/v1/entity/schemas/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["entity-schemas"] }),
})

export const useMoveEntityBlueprint = makeMoveHook({
  endpoint: (key) =>
    `/api/v1/entity/blueprints/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["entity-blueprints"] }),
})

export const useMoveEntitySkin = makeMoveHook({
  endpoint: (id) => `/api/v1/entity/skins/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["entity-skins"] }),
})

// ─── Collection ───────────────────────────────────────────────────────

export const useMoveCollectionAlbum = makeMoveHook({
  endpoint: (key) => `/api/v1/collection/albums/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["collection-albums"] }),
})

export const useMoveCollectionGroup = makeMoveHook({
  endpoint: (id) => `/api/v1/collection/groups/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["collection-groups"] }),
})

export const useMoveCollectionEntry = makeMoveHook({
  endpoint: (id) => `/api/v1/collection/entries/${id}/move`,
  invalidate: (qc) =>
    qc.invalidateQueries({ queryKey: ["collection-entries"] }),
})

export const useMoveCollectionMilestone = makeMoveHook({
  endpoint: (id) => `/api/v1/collection/milestones/${id}/move`,
  invalidate: (qc) =>
    qc.invalidateQueries({ queryKey: ["collection-milestones"] }),
})

// ─── Level ────────────────────────────────────────────────────────────

export const useMoveLevelConfig = makeMoveHook({
  endpoint: (key) => `/api/v1/level/configs/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["level-configs"] }),
})

export const useMoveLevelStage = makeMoveHook({
  endpoint: (id) => `/api/v1/level/stages/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["level-stages"] }),
})

export const useMoveLevel = makeMoveHook({
  endpoint: (id) => `/api/v1/level/levels/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["levels"] }),
})

// ─── Lottery ──────────────────────────────────────────────────────────

export const useMoveLotteryTier = makeMoveHook({
  endpoint: (id) => `/api/v1/lottery/tiers/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
})

export const useMoveLotteryPrize = makeMoveHook({
  endpoint: (id) => `/api/v1/lottery/prizes/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
})

// ─── Shop ─────────────────────────────────────────────────────────────

export const useMoveShopCategory = makeMoveHook({
  endpoint: (key) => `/api/v1/shop/categories/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["shop-categories"] }),
})

export const useMoveShopTag = makeMoveHook({
  endpoint: (key) => `/api/v1/shop/tags/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["shop-tags"] }),
})

export const useMoveShopProduct = makeMoveHook({
  endpoint: (key) => `/api/v1/shop/products/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["shop-products"] }),
})

export const useMoveShopGrowthStage = makeMoveHook({
  endpoint: (id) => `/api/v1/shop/stages/${id}/move`,
  invalidate: (qc) =>
    qc.invalidateQueries({ queryKey: ["shop-growth-stages"] }),
})

// ─── Task ─────────────────────────────────────────────────────────────

export const useMoveTaskCategory = makeMoveHook({
  endpoint: (id) => `/api/v1/task/categories/${id}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["task-categories"] }),
})

export const useMoveTaskDefinition = makeMoveHook({
  endpoint: (key) => `/api/v1/task/definitions/${encodeURIComponent(key)}/move`,
  invalidate: (qc) => qc.invalidateQueries({ queryKey: ["task-definitions"] }),
})
