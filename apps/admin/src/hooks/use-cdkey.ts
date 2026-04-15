import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CdkeyBatch,
  CdkeyCode,
  CdkeyRedemptionLog,
  CreateBatchInput,
  UpdateBatchInput,
} from "#/lib/types/cdkey"

const BATCHES_KEY = ["cdkey-batches"] as const

// ─── Batches ──────────────────────────────────────────────────────

export function useCdkeyBatches() {
  return useQuery({
    queryKey: BATCHES_KEY,
    queryFn: () => api.get<{ items: CdkeyBatch[] }>("/api/cdkey/batches"),
    select: (data) => data.items,
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

export function useCdkeyCodes(
  batchId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams()
  if (opts.status) params.set("status", opts.status)
  if (opts.limit != null) params.set("limit", String(opts.limit))
  if (opts.offset != null) params.set("offset", String(opts.offset))
  const qs = params.toString() ? `?${params}` : ""
  return useQuery({
    queryKey: ["cdkey-codes", batchId, opts],
    queryFn: () =>
      api.get<{ items: CdkeyCode[]; total: number }>(
        `/api/cdkey/batches/${batchId}/codes${qs}`,
      ),
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

export function useCdkeyLogs(
  batchId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams()
  if (opts.status) params.set("status", opts.status)
  if (opts.limit != null) params.set("limit", String(opts.limit))
  if (opts.offset != null) params.set("offset", String(opts.offset))
  const qs = params.toString() ? `?${params}` : ""
  return useQuery({
    queryKey: ["cdkey-logs", batchId, opts],
    queryFn: () =>
      api.get<{ items: CdkeyRedemptionLog[]; total: number }>(
        `/api/cdkey/batches/${batchId}/logs${qs}`,
      ),
    enabled: !!batchId,
  })
}
