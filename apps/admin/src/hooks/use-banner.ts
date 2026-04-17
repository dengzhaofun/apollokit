import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  Banner,
  BannerGroup,
  BannerGroupListResponse,
  BannerListResponse,
  CreateBannerGroupInput,
  CreateBannerInput,
  UpdateBannerGroupInput,
  UpdateBannerInput,
} from "#/lib/types/banner"

const GROUPS_KEY = ["banner-groups"] as const
const bannersKey = (groupId: string) =>
  ["banner-groups", groupId, "banners"] as const

// ─── Groups ────────────────────────────────────────────────────

export function useBannerGroups(
  filter: { activityId?: string; includeActivity?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (filter.activityId) params.set("activityId", filter.activityId)
  if (filter.includeActivity) params.set("includeActivity", "true")
  const qs = params.toString()
  return useQuery({
    queryKey: [...GROUPS_KEY, filter.activityId ?? null, !!filter.includeActivity],
    queryFn: () =>
      api.get<BannerGroupListResponse>(
        `/api/banner/groups${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
  })
}

export function useBannerGroup(id: string) {
  return useQuery({
    queryKey: [...GROUPS_KEY, id],
    queryFn: () => api.get<BannerGroup>(`/api/banner/groups/${id}`),
    enabled: !!id,
  })
}

export function useCreateBannerGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBannerGroupInput) =>
      api.post<BannerGroup>("/api/banner/groups", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

export function useUpdateBannerGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateBannerGroupInput
    }) => api.patch<BannerGroup>(`/api/banner/groups/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

export function useDeleteBannerGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/banner/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

// ─── Banners within a group ────────────────────────────────────

export function useBanners(groupId: string) {
  return useQuery({
    queryKey: bannersKey(groupId),
    queryFn: () =>
      api.get<BannerListResponse>(
        `/api/banner/groups/${groupId}/banners`,
      ),
    select: (data) => data.items,
    enabled: !!groupId,
  })
}

export function useBanner(id: string) {
  return useQuery({
    queryKey: ["banner", id],
    queryFn: () => api.get<Banner>(`/api/banner/banners/${id}`),
    enabled: !!id,
  })
}

export function useCreateBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      input,
    }: {
      groupId: string
      input: CreateBannerInput
    }) =>
      api.post<Banner>(`/api/banner/groups/${groupId}/banners`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) })
    },
  })
}

export function useUpdateBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      groupId: string
      input: UpdateBannerInput
    }) => api.patch<Banner>(`/api/banner/banners/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) })
      qc.invalidateQueries({ queryKey: ["banner", vars.id] })
    },
  })
}

export function useDeleteBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; groupId: string }) =>
      api.delete(`/api/banner/banners/${id}`),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) }),
  })
}

export function useReorderBanners() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      bannerIds,
    }: {
      groupId: string
      bannerIds: string[]
    }) =>
      api.post<BannerListResponse>(
        `/api/banner/groups/${groupId}/banners/reorder`,
        { bannerIds },
      ),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) }),
  })
}
