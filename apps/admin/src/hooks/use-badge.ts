import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  BadgeFromTemplateInput,
  BadgeNode,
  BadgeNodeList,
  BadgePreviewResponse,
  BadgeSignalInput,
  BadgeSignalRegistryEntry,
  BadgeSignalRegistryList,
  BadgeSignalWriteResult,
  BadgeTemplateList,
  BadgeValidateTreeResult,
  CreateBadgeNodeInput,
  UpdateBadgeNodeInput,
} from "#/lib/types/badge"

const NODES_KEY = ["badge", "nodes"] as const
const TEMPLATES_KEY = ["badge", "templates"] as const
const REGISTRY_KEY = ["badge", "signal-registry"] as const

export function useBadgeNodes() {
  return useQuery({
    queryKey: NODES_KEY,
    queryFn: () => api.get<BadgeNodeList>("/api/v1/badge/nodes"),
    select: (data) => data.items,
  })
}

export function useCreateBadgeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBadgeNodeInput) =>
      api.post<BadgeNode>("/api/v1/badge/nodes", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  })
}

export function useUpdateBadgeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBadgeNodeInput }) =>
      api.patch<BadgeNode>(`/api/v1/badge/nodes/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  })
}

export function useDeleteBadgeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/badge/nodes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  })
}

export function useValidateBadgeTree() {
  return useMutation({
    mutationFn: () =>
      api.post<BadgeValidateTreeResult>("/api/v1/badge/nodes/validate-tree"),
  })
}

export function useBadgeTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => api.get<BadgeTemplateList>("/api/v1/badge/templates"),
    select: (data) => data.templates,
    staleTime: Infinity, // templates are static
  })
}

export function useCreateBadgeNodeFromTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BadgeFromTemplateInput) =>
      api.post<BadgeNode>("/api/v1/badge/nodes/from-template", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  })
}

export function useBadgePreview() {
  return useMutation({
    mutationFn: (input: {
      endUserId: string
      rootKey?: string | null
      explain?: boolean
    }) =>
      api.post<BadgePreviewResponse>("/api/v1/badge/preview", {
        endUserId: input.endUserId,
        rootKey: input.rootKey ?? null,
        explain: input.explain ?? true,
      }),
  })
}

export function usePushBadgeSignal() {
  return useMutation({
    mutationFn: (input: BadgeSignalInput) =>
      api.post<BadgeSignalWriteResult>("/api/v1/badge/signal", input),
  })
}

export function useBadgeSignalRegistry() {
  return useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: () =>
      api.get<BadgeSignalRegistryList>("/api/v1/badge/signal-registry"),
    select: (data) => data.items,
  })
}

export function useUpsertBadgeSignalRegistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      keyPattern: string
      isDynamic?: boolean
      label: string
      description?: string | null
      exampleMeta?: Record<string, unknown> | null
    }) => api.put<BadgeSignalRegistryEntry>("/api/v1/badge/signal-registry", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REGISTRY_KEY }),
  })
}

export function useDeleteBadgeSignalRegistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyPattern: string) =>
      api.delete(
        `/api/v1/badge/signal-registry/${encodeURIComponent(keyPattern)}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: REGISTRY_KEY }),
  })
}
