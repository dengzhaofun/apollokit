import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CdkeyBatch,
  CdkeyCode,
  CdkeyRedemptionLog,
  CreateBatchInput,
  UpdateBatchInput,
} from "#/lib/types/cdkey"
import * as m from "#/paraglide/messages.js"

const BATCHES_KEY = ["cdkey-batches"] as const

// ─── Batches ──────────────────────────────────────────────────────

export const CDKEY_BATCH_FILTER_DEFS: FilterDef[] = []

/** Paginated batches — for the admin BatchTable. URL-driven. */
 
export function useCdkeyBatches(route: AnyRoute) {
  return useListSearch<CdkeyBatch>({
    route,
    queryKey: BATCHES_KEY,
    filterDefs: CDKEY_BATCH_FILTER_DEFS,
    searchPlaceholder: m.cdkey_batch_search_placeholder(),
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CdkeyBatch>>(
        `/api/v1/cdkey/batches?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useCdkeyBatch(key: string) {
  return useQuery({
    queryKey: [...BATCHES_KEY, key],
    queryFn: () => api.get<CdkeyBatch>(`/api/v1/cdkey/batches/${key}`),
    enabled: !!key,
  })
}

export function useCreateCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBatchInput) =>
      api.post<CdkeyBatch>("/api/v1/cdkey/batches", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

export function useUpdateCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateBatchInput & { key: string }) =>
      api.patch<CdkeyBatch>(`/api/v1/cdkey/batches/${key}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

export function useDeleteCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api.delete(`/api/v1/cdkey/batches/${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

// ─── Codes ─────────────────────────────────────────────────────────

export const CDKEY_CODE_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: m.filter_label_status(),
    type: "select",
    options: [
      { value: "pending", label: m.filter_opt_pending() },
      { value: "redeemed", label: m.filter_opt_redeemed() },
      { value: "revoked", label: m.filter_opt_revoked() },
      { value: "active", label: m.filter_opt_active() },
    ],
  },
]

/** Paginated codes under one batch. URL-driven. */
 
export function useCdkeyCodes(batchId: string, route: AnyRoute) {
  return useListSearch<CdkeyCode>({
    route,
    queryKey: ["cdkey-codes", batchId],
    filterDefs: CDKEY_CODE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CdkeyCode>>(
        `/api/v1/cdkey/batches/${batchId}/codes?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
    enabled: !!batchId,
  })
}

export function useGenerateCdkeyCodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batchId, count }: { batchId: string; count: number }) =>
      api.post<{ generated: number }>(
        `/api/v1/cdkey/batches/${batchId}/codes/generate`,
        { count },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cdkey-codes", vars.batchId] })
      qc.invalidateQueries({ queryKey: BATCHES_KEY })
    },
  })
}

export function useRevokeCdkeyCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (codeId: string) =>
      api.patch<CdkeyCode>(`/api/v1/cdkey/codes/${codeId}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cdkey-codes"] }),
  })
}

// ─── Logs ──────────────────────────────────────────────────────────

export const CDKEY_LOG_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: m.filter_label_status(),
    type: "select",
    options: [
      { value: "success", label: m.filter_opt_success() },
      { value: "failed", label: m.filter_opt_failed() },
    ],
  },
]

/** Paginated redemption logs under one batch. URL-driven. */
 
export function useCdkeyLogs(batchId: string, route: AnyRoute) {
  return useListSearch<CdkeyRedemptionLog>({
    route,
    queryKey: ["cdkey-logs", batchId],
    filterDefs: CDKEY_LOG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CdkeyRedemptionLog>>(
        `/api/v1/cdkey/batches/${batchId}/logs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
    enabled: !!batchId,
  })
}
