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
import * as m from "#/paraglide/messages.js"

const CATEGORIES_KEY = ["task-categories"] as const
const categoryKey = (id: string) => ["task-category", id] as const
const DEFINITIONS_KEY = ["task-definitions"] as const
const definitionKey = (key: string) => ["task-definition", key] as const

// ─── Categories ──────────────────────────────────────────────────

export const TASK_CATEGORY_FILTER_DEFS: FilterDef[] = [
  {
    id: "scope",
    label: m.filter_label_scope(),
    type: "select",
    options: [
      { value: "task", label: m.filter_opt_task() },
      { value: "achievement", label: m.filter_opt_achievement() },
      { value: "custom", label: m.filter_opt_custom() },
    ],
  },
  {
    id: "isActive",
    label: m.filter_label_status(),
    type: "boolean",
    trueLabel: m.filter_opt_active(),
    falseLabel: m.filter_opt_inactive(),
  },
]

/** Paginated task categories — URL-driven. */
 
export function useTaskCategories(route: AnyRoute) {
  return useListSearch<TaskCategory>({
    route,
    queryKey: CATEGORIES_KEY,
    filterDefs: TASK_CATEGORY_FILTER_DEFS,
    searchPlaceholder: m.task_category_search_placeholder(),
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
    label: m.filter_label_period(),
    type: "select",
    options: [
      { value: "daily", label: m.filter_opt_daily() },
      { value: "weekly", label: m.filter_opt_weekly() },
      { value: "monthly", label: m.filter_opt_monthly() },
      { value: "none", label: m.filter_opt_none() },
    ],
  },
  {
    id: "countingMethod",
    label: m.filter_label_counting_method(),
    type: "select",
    options: [
      { value: "increment", label: m.filter_opt_increment() },
      { value: "snapshot", label: m.filter_opt_snapshot() },
      { value: "max", label: m.filter_opt_max() },
    ],
  },
  {
    id: "visibility",
    label: m.filter_label_visibility(),
    type: "select",
    options: [
      { value: "broadcast", label: m.filter_opt_broadcast() },
      { value: "assigned", label: m.filter_opt_assigned() },
    ],
  },
  {
    id: "isActive",
    label: m.filter_label_active(),
    type: "boolean",
  },
  {
    id: "isHidden",
    label: m.filter_label_hidden(),
    type: "boolean",
  },
  {
    id: "categoryId",
    label: m.filter_label_category(),
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
    searchPlaceholder: m.task_definition_search_placeholder(),
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
