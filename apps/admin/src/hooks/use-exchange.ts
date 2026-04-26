import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  ExchangeConfig,
  ExchangeOption,
  ExchangeResult,
  ExchangeUserState,
  CreateConfigInput,
  UpdateConfigInput,
  CreateOptionInput,
  UpdateOptionInput,
  ExecuteExchangeInput,
} from "#/lib/types/exchange"

const CONFIGS_KEY = ["exchange-configs"] as const

// ─── Configs ──────────────────────────────────────────────────────

export const EXCHANGE_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated configs — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useExchangeConfigs(route: any) {
  return useListSearch<ExchangeConfig>({
    route,
    queryKey: CONFIGS_KEY,
    filterDefs: EXCHANGE_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<ExchangeConfig>>(
        `/api/exchange/configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllExchangeConfigs() {
  return useQuery({
    queryKey: [...CONFIGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<ExchangeConfig>>(`/api/exchange/configs?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useExchangeConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () => api.get<ExchangeConfig>(`/api/exchange/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateExchangeConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConfigInput) =>
      api.post<ExchangeConfig>("/api/exchange/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateExchangeConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateConfigInput & { id: string }) =>
      api.patch<ExchangeConfig>(`/api/exchange/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteExchangeConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exchange/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

// ─── Options ──────────────────────────────────────────────────────

export const EXCHANGE_OPTION_FILTER_DEFS: FilterDef[] = []

/** Paginated options under one config — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useExchangeOptions(configKey: string, route: any) {
  return useListSearch<ExchangeOption>({
    route,
    queryKey: ["exchange-options", configKey],
    filterDefs: EXCHANGE_OPTION_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<ExchangeOption>>(
        `/api/exchange/configs/${configKey}/options?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
    enabled: !!configKey,
  })
}

/** Non-paginated convenience for option selectors. */
export function useAllExchangeOptions(configKey: string) {
  return useQuery({
    queryKey: ["exchange-options", configKey, "all"],
    queryFn: () =>
      api
        .get<Page<ExchangeOption>>(
          `/api/exchange/configs/${configKey}/options?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
    enabled: !!configKey,
  })
}

export function useCreateExchangeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      configKey,
      ...input
    }: CreateOptionInput & { configKey: string }) =>
      api.post<ExchangeOption>(
        `/api/exchange/configs/${configKey}/options`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["exchange-options"] }),
  })
}

export function useUpdateExchangeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ optionId, ...input }: UpdateOptionInput & { optionId: string }) =>
      api.patch<ExchangeOption>(`/api/exchange/options/${optionId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["exchange-options"] }),
  })
}

export function useDeleteExchangeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (optionId: string) =>
      api.delete(`/api/exchange/options/${optionId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["exchange-options"] }),
  })
}

// ─── Execute / User State ─────────────────────────────────────────

export function useExecuteExchange() {
  return useMutation({
    mutationFn: ({
      optionId,
      ...input
    }: ExecuteExchangeInput & { optionId: string }) =>
      api.post<ExchangeResult>(
        `/api/exchange/options/${optionId}/execute`,
        input,
      ),
  })
}

export function useExchangeUserState(optionId: string, endUserId: string) {
  return useQuery({
    queryKey: ["exchange-user-state", optionId, endUserId],
    queryFn: () =>
      api.get<ExchangeUserState>(
        `/api/exchange/options/${optionId}/users/${endUserId}/state`,
      ),
    enabled: !!optionId && !!endUserId,
  })
}
