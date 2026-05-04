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

export const TASK_CATEGORY_FILTER_DEFS: FilterDef[] = [
  {
    id: "scope",
    label: "Scope",
    type: "select",
    options: [
      { value: "task", label: "Task" },
      { value: "achievement", label: "Achievement" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    id: "isActive",
    label: "Status",
    type: "boolean",
    trueLabel: "Active",
    falseLabel: "Inactive",
  },
]

/** Paginated task categories — URL-driven. */
 
export function useTaskCategories(route: AnyRoute) {
  return useListSearch<TaskCategory>({
    route,
    queryKey: CATEGORIES_KEY,
    filterDefs: TASK_CATEGORY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<TaskCategory>>(
        `/api/v1/task/categories?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllTaskCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<TaskCategory>>(`/api/v1/task/categories?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useTaskCategory(id: string) {
  return useQuery({
    queryKey: categoryKey(id),
    queryFn: () => api.get<TaskCategory>(`/api/v1/task/categories/${id}`),
    enabled: !!id,
  })
}

export function useCreateTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<TaskCategory>("/api/v1/task/categories", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useUpdateTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<TaskCategory>(`/api/v1/task/categories/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      qc.invalidateQueries({ queryKey: categoryKey(vars.id) })
    },
  })
}

export function useDeleteTaskCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/task/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

// ─── Definitions ─────────────────────────────────────────────────

export const TASK_DEFINITION_FILTER_DEFS: FilterDef[] = [
  {
    id: "period",
    label: "Period",
    type: "select",
    options: [
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "none", label: "None" },
    ],
  },
  {
    id: "countingMethod",
    label: "Counting method",
    type: "select",
    options: [
      { value: "increment", label: "Increment" },
      { value: "snapshot", label: "Snapshot" },
      { value: "max", label: "Max" },
    ],
  },
  {
    id: "visibility",
    label: "Visibility",
    type: "select",
    options: [
      { value: "broadcast", label: "Broadcast" },
      { value: "assigned", label: "Assigned" },
    ],
  },
  {
    id: "isActive",
    label: "Active",
    type: "boolean",
  },
  {
    id: "isHidden",
    label: "Hidden",
    type: "boolean",
  },
  {
    id: "categoryId",
    label: "Category",
    type: "select",
    // Options are populated dynamically by the consumer if needed; the
    // hook only writes string values to the URL key.
    options: [],
  },
]

/**
 * Paginated task definitions — URL-driven.
 *
 * TODO: `apps/admin/src/routes/_dashboard/task/index.tsx` renders multiple
 * `<DefinitionTable>` instances inside category tabs. They share one URL
 * search-param namespace, so a `categoryId` filter set on one tab would
 * apply to every other tab. The `extraQuery` arg below is the temporary
 * escape hatch the page uses to scope the query without writing into the
 * URL — it's NOT part of the URL contract; per-tab URL filters need
 * follow-up routing rework.
 */
/**
 * URL-driven task definitions list. Default scope: permanent /
 * non-activity-bound only — activity-scoped tasks are managed inside
 * the activity's detail page.
 */
export function useTaskDefinitions(
  route: AnyRoute,
  extraQuery: { categoryId?: string; activityId?: string; includeActivity?: boolean } = {},
) {
  const { categoryId, activityId, includeActivity } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<TaskDefinition>({
    route,
    queryKey: [
      ...DEFINITIONS_KEY,
      {
        categoryId: categoryId ?? null,
        activityId: effectiveActivityId,
        includeActivity: !!includeActivity,
      },
    ],
    filterDefs: TASK_DEFINITION_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<TaskDefinition>>(
        `/api/v1/task/definitions?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          // extraQuery overrides whatever the URL set
          categoryId: categoryId ?? (filters.categoryId as string | undefined),
          activityId: effectiveActivityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
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
          `/api/v1/task/definitions?${buildQs({
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
      api.get<TaskDefinition>(`/api/v1/task/definitions/${key}`),
    enabled: !!key,
  })
}

export function useCreateTaskDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDefinitionInput) =>
      api.post<TaskDefinition>("/api/v1/task/definitions", input),
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
    }) => api.patch<TaskDefinition>(`/api/v1/task/definitions/${key}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: DEFINITIONS_KEY })
      qc.invalidateQueries({ queryKey: definitionKey(vars.key) })
    },
  })
}

export function useDeleteTaskDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api.delete(`/api/v1/task/definitions/${key}`),
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
        `/api/v1/task/definitions/${taskKey}/assignments${qs ? `?${qs}` : ""}`,
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
        `/api/v1/task/definitions/${taskKey}/assignments`,
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
        `/api/v1/task/definitions/${taskKey}/assignments/${encodeURIComponent(endUserId)}`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["task-assignments", taskKey] }),
  })
}
