import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
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

export function useExchangeConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: () =>
      api.get<{ items: ExchangeConfig[] }>("/api/exchange/configs"),
    select: (data) => data.items,
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

export function useExchangeOptions(configKey: string) {
  return useQuery({
    queryKey: ["exchange-options", configKey],
    queryFn: () =>
      api.get<{ items: ExchangeOption[] }>(
        `/api/exchange/configs/${configKey}/options`,
      ),
    select: (data) => data.items,
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
