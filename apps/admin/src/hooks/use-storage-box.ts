import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateStorageBoxConfigInput,
  DepositInput,
  DepositResult,
  StorageBoxConfig,
  StorageBoxDepositView,
  UpdateStorageBoxConfigInput,
  WithdrawInput,
  WithdrawResult,
} from "#/lib/types/storage-box"

const CONFIGS_KEY = ["storage-box-configs"] as const
const DEPOSITS_KEY = ["storage-box-deposits"] as const

// ─── Configs ──────────────────────────────────────────────────────

/** Paginated configs — for the admin StorageBoxConfigTable. */
export function useStorageBoxConfigs(initialPageSize = 50) {
  return useCursorList<StorageBoxConfig>({
    queryKey: CONFIGS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<StorageBoxConfig>>(
        `/api/storage-box/configs?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllStorageBoxConfigs() {
  return useQuery({
    queryKey: [...CONFIGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<StorageBoxConfig>>(
          `/api/storage-box/configs?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
  })
}

export function useStorageBoxConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () =>
      api.get<StorageBoxConfig>(`/api/storage-box/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateStorageBoxConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStorageBoxConfigInput) =>
      api.post<StorageBoxConfig>("/api/storage-box/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateStorageBoxConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateStorageBoxConfigInput & { id: string }) =>
      api.patch<StorageBoxConfig>(`/api/storage-box/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteStorageBoxConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/storage-box/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

// ─── Deposits / Withdrawals ──────────────────────────────────────

export function useUserDeposits(endUserId: string) {
  return useQuery({
    queryKey: [...DEPOSITS_KEY, endUserId],
    queryFn: () =>
      api.get<{ items: StorageBoxDepositView[] }>(
        `/api/storage-box/deposits/${endUserId}`,
      ),
    select: (data) => data.items,
    enabled: !!endUserId,
  })
}

export function useDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DepositInput) =>
      api.post<DepositResult>("/api/storage-box/deposits", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEPOSITS_KEY })
      qc.invalidateQueries({ queryKey: ["item-inventory"] })
      qc.invalidateQueries({ queryKey: ["item-balance"] })
    },
  })
}

export function useWithdraw() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WithdrawInput) =>
      api.post<WithdrawResult>("/api/storage-box/withdrawals", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEPOSITS_KEY })
      qc.invalidateQueries({ queryKey: ["item-inventory"] })
      qc.invalidateQueries({ queryKey: ["item-balance"] })
    },
  })
}
