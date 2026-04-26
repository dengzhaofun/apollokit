import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  AssignBatchResponse,
  AssignTaskInput,
  AssignmentListResponse,
  CreateCategoryInput,
  CreateDefinitionInput,
  TaskCategory,
  TaskDefinition,
  UpdateCategoryInput,
  UpdateDefinitionInput,
} from "#/lib/types/task"

const CATEGORIES_KEY = ["task-categories"] as const
const categoryKey = (id: string) => ["task-category", id] as const
const DEFINITIONS_KEY = ["task-definitions"] as const
const definitionKey = (key: string) => ["task-definition", key] as const

// ─── Categories ──────────────────────────────────────────────────

/** Paginated task categories — for the admin categories table. */
export function useTaskCategories(initialPageSize = 50) {
  return useCursorList<TaskCategory>({
    queryKey: CATEGORIES_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<TaskCategory>>(
        `/api/task/categories?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllTaskCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<TaskCategory>>(`/api/task/categories?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useTaskCategory(id: string) {
  return useQuery({
    queryKey: categoryKey(id),
    queryFn: () => api.get<TaskCategory>(`/api/task/categories/${id}`),
    enabled: !!id,
  })
}

export function useCreateTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<TaskCategory>("/api/task/categories", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useUpdateTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<TaskCategory>(`/api/task/categories/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      qc.invalidateQueries({ queryKey: categoryKey(vars.id) })
    },
  })
}

export function useDeleteTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/task/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

// ─── Definitions ─────────────────────────────────────────────────

/** Paginated task definitions — for the admin definitions table. */
export function useTaskDefinitions(
  opts: {
    categoryId?: string
    period?: string
    activityId?: string
    includeActivity?: boolean
    initialPageSize?: number
  } = {},
) {
  const { categoryId, period, activityId, includeActivity, initialPageSize = 50 } = opts
  return useCursorList<TaskDefinition>({
    queryKey: [
      ...DEFINITIONS_KEY,
      {
        categoryId: categoryId ?? null,
        period: period ?? null,
        activityId: activityId ?? null,
        includeActivity: !!includeActivity,
      },
    ],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<TaskDefinition>>(
        `/api/task/definitions?${buildQs({
          cursor,
          limit,
          q,
          categoryId,
          period,
          activityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllTaskDefinitions(
  opts: {
    categoryId?: string
    period?: string
    activityId?: string
    includeActivity?: boolean
  } = {},
) {
  const { categoryId, period, activityId, includeActivity } = opts
  return useQuery({
    queryKey: [
      ...DEFINITIONS_KEY,
      "all",
      {
        categoryId: categoryId ?? null,
        period: period ?? null,
        activityId: activityId ?? null,
        includeActivity: !!includeActivity,
      },
    ],
    queryFn: () =>
      api
        .get<Page<TaskDefinition>>(
          `/api/task/definitions?${buildQs({
            limit: 200,
            categoryId,
            period,
            activityId,
            includeActivity: includeActivity ? "true" : undefined,
          })}`,
        )
        .then((p) => p.items),
  })
}

export function useTaskDefinition(key: string) {
  return useQuery({
    queryKey: definitionKey(key),
    queryFn: () =>
      api.get<TaskDefinition>(`/api/task/definitions/${key}`),
    enabled: !!key,
  })
}

export function useCreateTaskDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDefinitionInput) =>
      api.post<TaskDefinition>("/api/task/definitions", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useUpdateTaskDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      input,
    }: {
      key: string
      input: UpdateDefinitionInput
    }) => api.patch<TaskDefinition>(`/api/task/definitions/${key}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: DEFINITIONS_KEY })
      qc.invalidateQueries({ queryKey: definitionKey(vars.key) })
    },
  })
}

export function useDeleteTaskDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api.delete(`/api/task/definitions/${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

// ─── Assignments (定向分配) ──────────────────────────────────────

const assignmentsKey = (
  taskKey: string,
  filter?: { endUserId?: string; activeOnly?: boolean },
) =>
  [
    "task-assignments",
    taskKey,
    filter?.endUserId ?? null,
    filter?.activeOnly ?? true,
  ] as const

export function useTaskAssignments(
  taskKey: string,
  filter?: { endUserId?: string; activeOnly?: boolean; limit?: number },
) {
  const params = new URLSearchParams()
  if (filter?.endUserId) params.set("endUserId", filter.endUserId)
  if (filter?.activeOnly !== undefined) {
    params.set("activeOnly", filter.activeOnly ? "true" : "false")
  }
  if (filter?.limit) params.set("limit", String(filter.limit))
  const qs = params.toString()

  return useQuery({
    queryKey: assignmentsKey(taskKey, filter),
    queryFn: () =>
      api.get<AssignmentListResponse>(
        `/api/task/definitions/${taskKey}/assignments${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
    enabled: !!taskKey,
  })
}

export function useAssignTask(taskKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AssignTaskInput) =>
      api.post<AssignBatchResponse>(
        `/api/task/definitions/${taskKey}/assignments`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["task-assignments", taskKey] }),
  })
}

export function useRevokeAssignment(taskKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.delete(
        `/api/task/definitions/${taskKey}/assignments/${encodeURIComponent(endUserId)}`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["task-assignments", taskKey] }),
  })
}
