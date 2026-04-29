import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateTriggerRuleInput,
  DryRunResponse,
  TriggerExecution,
  TriggerExecutionListResponse,
  TriggerExecutionStatus,
  TriggerRule,
  TriggerRuleListResponse,
  UpdateTriggerRuleInput,
} from "#/lib/types/triggers"

const RULES_KEY = ["triggers", "rules"] as const
const ruleKey = (id: string) => ["triggers", "rules", id] as const
const EXECUTIONS_KEY = ["triggers", "executions"] as const

/** List all trigger rules for the current org. */
export function useTriggerRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: () =>
      api
        .get<TriggerRuleListResponse>("/api/triggers/rules")
        .then((r) => r.items),
  })
}

/** Get one rule by id. Used by the editor route. */
export function useTriggerRule(id: string | undefined) {
  return useQuery({
    queryKey: id ? ruleKey(id) : ["triggers", "rules", "_disabled"],
    queryFn: () => api.get<TriggerRule>(`/api/triggers/rules/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateTriggerRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTriggerRuleInput) =>
      api.post<TriggerRule>("/api/triggers/rules", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

export function useUpdateTriggerRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: UpdateTriggerRuleInput & { id: string }) =>
      api.patch<TriggerRule>(`/api/triggers/rules/${id}`, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RULES_KEY })
      qc.invalidateQueries({ queryKey: ruleKey(vars.id) })
    },
  })
}

export function useArchiveTriggerRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/triggers/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

export function useDryRunTriggerRule() {
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: Record<string, unknown>
    }) =>
      api.post<DryRunResponse>(`/api/triggers/rules/${id}/dry-run`, {
        payload,
      }),
  })
}

export function useTriggerExecutions(filter?: {
  ruleId?: string
  status?: TriggerExecutionStatus
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (filter?.ruleId) qs.set("ruleId", filter.ruleId)
  if (filter?.status) qs.set("status", filter.status)
  if (filter?.limit) qs.set("limit", String(filter.limit))
  const queryString = qs.toString()
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, filter?.ruleId ?? "all", filter?.status ?? "all", filter?.limit ?? 50],
    queryFn: () =>
      api
        .get<TriggerExecutionListResponse>(
          `/api/triggers/executions${queryString ? `?${queryString}` : ""}`,
        )
        .then((r) => r.items as TriggerExecution[]),
  })
}
