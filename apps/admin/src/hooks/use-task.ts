import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CategoryListResponse,
  CreateCategoryInput,
  CreateDefinitionInput,
  DefinitionListResponse,
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

export function useTaskCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api.get<CategoryListResponse>("/api/task/categories"),
    select: (data) => data.items,
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

export function useTaskDefinitions(filters?: {
  categoryId?: string
  period?: string
}) {
  const params = new URLSearchParams()
  if (filters?.categoryId) params.set("categoryId", filters.categoryId)
  if (filters?.period) params.set("period", filters.period)
  const qs = params.toString()
  const path = `/api/task/definitions${qs ? `?${qs}` : ""}`

  return useQuery({
    queryKey: [...DEFINITIONS_KEY, filters?.categoryId, filters?.period],
    queryFn: () => api.get<DefinitionListResponse>(path),
    select: (data) => data.items,
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
