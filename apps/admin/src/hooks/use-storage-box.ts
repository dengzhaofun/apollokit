import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
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

export const STORAGE_BOX_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated configs — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStorageBoxConfigs(route: any) {
  return useListSearch<StorageBoxConfig>({
    route,
    queryKey: CONFIGS_KEY,
    filterDefs: STORAGE_BOX_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<StorageBoxConfig>>(
        `/api/storage-box/configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
