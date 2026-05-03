import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  Banner,
  BannerGroup,
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

export const BANNER_GROUP_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated banner groups — URL-driven. Default scope: permanent /
 * non-activity-bound only.
 */
export function useBannerGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extraQuery: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<BannerGroup>({
    route,
    queryKey: [
      ...GROUPS_KEY,
      { activityId: effectiveActivityId, includeActivity: !!includeActivity },
    ],
    filterDefs: BANNER_GROUP_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<BannerGroup>>(
        `/api/v1/banner/groups?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          activityId: effectiveActivityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllBannerGroups(
  opts: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = opts
  return useQuery({
    queryKey: [...GROUPS_KEY, "all", { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    queryFn: () =>
      api
        .get<Page<BannerGroup>>(
          `/api/v1/banner/groups?${buildQs({
            limit: 200,
            activityId,
            includeActivity: includeActivity ? "true" : undefined,
          })}`,
        )
        .then((p) => p.items),
  })
}

export function useBannerGroup(id: string) {
  return useQuery({
    queryKey: [...GROUPS_KEY, id],
    queryFn: () => api.get<BannerGroup>(`/api/v1/banner/groups/${id}`),
    enabled: !!id,
  })
}

export function useCreateBannerGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBannerGroupInput) =>
      api.post<BannerGroup>("/api/v1/banner/groups", input),
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
    }) => api.patch<BannerGroup>(`/api/v1/banner/groups/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

export function useDeleteBannerGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/banner/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

// ─── Banners within a group ────────────────────────────────────

export const BANNER_FILTER_DEFS: FilterDef[] = []

/** Paginated banners under a group — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBanners(groupId: string, route: any) {
  return useListSearch<Banner>({
    route,
    queryKey: bannersKey(groupId),
    filterDefs: BANNER_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Banner>>(
        `/api/v1/banner/groups/${groupId}/banners?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
    enabled: !!groupId,
  })
}

/** Non-paginated convenience used by reorder/preview flows. */
export function useAllBanners(groupId: string) {
  return useQuery({
    queryKey: [...bannersKey(groupId), "all"],
    queryFn: () =>
      api
        .get<Page<Banner>>(
          `/api/v1/banner/groups/${groupId}/banners?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
    enabled: !!groupId,
  })
}

export function useBanner(id: string) {
  return useQuery({
    queryKey: ["banner", id],
    queryFn: () => api.get<Banner>(`/api/v1/banner/banners/${id}`),
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
      api.post<Banner>(`/api/v1/banner/groups/${groupId}/banners`, input),
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
    }) => api.patch<Banner>(`/api/v1/banner/banners/${id}`, input),
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
      api.delete(`/api/v1/banner/banners/${id}`),
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
        `/api/v1/banner/groups/${groupId}/banners/reorder`,
        { bannerIds },
      ),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) }),
  })
}

import type { MoveBody } from "#/components/common/SortableList"

export function useMoveBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      groupId: string
      body: MoveBody
    }) => api.post(`/api/v1/banner/banners/${id}/move`, body),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: bannersKey(vars.groupId) }),
  })
}
