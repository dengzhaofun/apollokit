/**
 * React Query hooks for the experiment admin module.
 *
 * Mirrors `use-offline-check-in.ts`:
 *   - paginated list via `useListSearch`
 *   - one-shot CRUD mutations
 *   - per-experiment variants + assignments via `useQuery`
 *   - bucketing-preview mutation + status-transition mutation
 *
 * Cache invalidation:
 *   - Experiment mutations invalidate `["experiments"]`.
 *   - Variant mutations invalidate the *experiment-scoped* variants key
 *     `["experiment-variants", experimentKey]` so editing a variant on
 *     experiment A doesn't blow away experiment B's variant cache.
 *   - Status transitions invalidate both keys (variants list shows
 *     assignedUsers counts that may grow once running).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import { api } from "#/lib/api-client"
import type {
  CreateExperimentInput,
  CreateVariantInput,
  Experiment,
  ExperimentAssignment,
  ExperimentPrimaryMetric,
  ExperimentStatus,
  ExperimentVariant,
  PreviewBucketingResult,
  UpdateExperimentInput,
  UpdateVariantInput,
} from "#/lib/types/experiment"

const EXPERIMENTS_KEY = ["experiments"] as const

export const EXPERIMENT_FILTER_DEFS: FilterDef[] = []

/** Paginated experiments — URL-driven via the standard list-search hook. */
export function useExperiments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extra: { status?: ExperimentStatus | "" } = {},
) {
  const { status } = extra
  return useListSearch<Experiment>({
    route,
    queryKey: [...EXPERIMENTS_KEY, { status: status ?? null }],
    filterDefs: EXPERIMENT_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Experiment>>(
        `/api/experiment/experiments?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          status: status || undefined,
        })}`,
      ),
  })
}

export function useExperiment(key: string) {
  return useQuery({
    queryKey: [...EXPERIMENTS_KEY, key],
    queryFn: () =>
      api.get<Experiment>(`/api/experiment/experiments/${key}`),
    enabled: !!key,
  })
}

export function useCreateExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExperimentInput) =>
      api.post<Experiment>("/api/experiment/experiments", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY }),
  })
}

export function useUpdateExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExperimentInput & { id: string }) =>
      api.patch<Experiment>(`/api/experiment/experiments/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY }),
  })
}

export function useDeleteExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/experiment/experiments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY }),
  })
}

/** Status transition (draft↔running↔paused↔archived). */
export function useTransitionExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: ExperimentStatus }) =>
      api.post<Experiment>(`/api/experiment/experiments/${id}:transition`, {
        to,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY })
      qc.invalidateQueries({ queryKey: variantsKey(vars.id) })
    },
  })
}

// ─── Variants ────────────────────────────────────────────────────

const variantsKey = (experimentKey: string) =>
  ["experiment-variants", experimentKey] as const

export function useExperimentVariants(experimentKey: string) {
  return useQuery({
    queryKey: variantsKey(experimentKey),
    queryFn: () =>
      api
        .get<{ items: ExperimentVariant[] }>(
          `/api/experiment/experiments/${experimentKey}/variants`,
        )
        .then((r) => r.items),
    enabled: !!experimentKey,
  })
}

export function useCreateVariant(experimentKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVariantInput) =>
      api.post<ExperimentVariant>(
        `/api/experiment/experiments/${experimentKey}/variants`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: variantsKey(experimentKey) })
      qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY })
    },
  })
}

export function useUpdateVariant(experimentKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateVariantInput & { id: string }) =>
      api.patch<ExperimentVariant>(`/api/experiment/variants/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: variantsKey(experimentKey) })
      qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY })
    },
  })
}

export function useDeleteVariant(experimentKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/experiment/variants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: variantsKey(experimentKey) })
      qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY })
    },
  })
}

// ─── Bucketing preview (admin-only) ─────────────────────────────

export function usePreviewBucketing(experimentKey: string) {
  return useMutation({
    mutationFn: (input: {
      end_user_id?: string
      sample_size?: number
      attributes_sample?: Record<string, unknown>
    }) =>
      api.post<PreviewBucketingResult>(
        `/api/experiment/experiments/${experimentKey}/preview-bucketing`,
        input,
      ),
  })
}

// ─── Primary metric (v1.5) ──────────────────────────────────────

export function useSetPrimaryMetric(experimentKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      primaryMetric,
      metricWindowDays,
    }: {
      id: string
      primaryMetric: ExperimentPrimaryMetric | null
      metricWindowDays?: number
    }) =>
      api.patch<Experiment>(
        `/api/experiment/experiments/${id}/primary-metric`,
        { primaryMetric, metricWindowDays },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPERIMENTS_KEY })
      qc.invalidateQueries({ queryKey: [...EXPERIMENTS_KEY, experimentKey] })
    },
  })
}

// ─── Assignments (debug) ─────────────────────────────────────────

export function useExperimentAssignments(
  experimentKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
) {
  return useListSearch<ExperimentAssignment>({
    route,
    queryKey: ["experiment-assignments", experimentKey],
    filterDefs: [],
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<ExperimentAssignment>>(
        `/api/experiment/experiments/${experimentKey}/assignments?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
        })}`,
      ),
    enabled: !!experimentKey,
  })
}
