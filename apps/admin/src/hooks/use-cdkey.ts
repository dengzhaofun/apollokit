import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CdkeyBatch,
  CdkeyCode,
  CdkeyRedemptionLog,
  CreateBatchInput,
  UpdateBatchInput,
} from "#/lib/types/cdkey"

const BATCHES_KEY = ["cdkey-batches"] as const

// ─── Batches ──────────────────────────────────────────────────────

/** Paginated batches — for the admin BatchTable. */
export function useCdkeyBatches(initialPageSize = 50) {
  return useCursorList<CdkeyBatch>({
    queryKey: BATCHES_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CdkeyBatch>>(
        `/api/cdkey/batches?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

export function useCdkeyBatch(key: string) {
  return useQuery({
    queryKey: [...BATCHES_KEY, key],
    queryFn: () => api.get<CdkeyBatch>(`/api/cdkey/batches/${key}`),
    enabled: !!key,
  })
}

export function useCreateCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBatchInput) =>
      api.post<CdkeyBatch>("/api/cdkey/batches", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

export function useUpdateCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateBatchInput & { key: string }) =>
      api.patch<CdkeyBatch>(`/api/cdkey/batches/${key}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

export function useDeleteCdkeyBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api.delete(`/api/cdkey/batches/${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  })
}

// ─── Codes ─────────────────────────────────────────────────────────

/** Paginated codes under one batch. */
export function useCdkeyCodes(
  batchId: string,
  opts: { status?: string; initialPageSize?: number } = {},
) {
  const { status, initialPageSize = 50 } = opts
  return useCursorList<CdkeyCode>({
    queryKey: ["cdkey-codes", batchId, { status: status ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CdkeyCode>>(
        `/api/cdkey/batches/${batchId}/codes?${buildQs({ cursor, limit, q, status })}`,
      ),
    initialPageSize,
    enabled: !!batchId,
  })
}

export function useGenerateCdkeyCodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batchId, count }: { batchId: string; count: number }) =>
      api.post<{ generated: number }>(
        `/api/cdkey/batches/${batchId}/codes/generate`,
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
      api.patch<CdkeyCode>(`/api/cdkey/codes/${codeId}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cdkey-codes"] }),
  })
}

// ─── Logs ──────────────────────────────────────────────────────────

/** Paginated redemption logs under one batch. */
export function useCdkeyLogs(
  batchId: string,
  opts: { status?: string; initialPageSize?: number } = {},
) {
  const { status, initialPageSize = 50 } = opts
  return useCursorList<CdkeyRedemptionLog>({
    queryKey: ["cdkey-logs", batchId, { status: status ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CdkeyRedemptionLog>>(
        `/api/cdkey/batches/${batchId}/logs?${buildQs({ cursor, limit, q, status })}`,
      ),
    initialPageSize,
    enabled: !!batchId,
  })
}
