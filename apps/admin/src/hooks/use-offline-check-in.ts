/**
 * React Query hooks for the offline-check-in admin module.
 *
 * Mirrors the layout of `use-check-in.ts`:
 *   - paginated list via `useListSearch`
 *   - one-shot CRUD mutations
 *   - inline campaign / spot reads via `useQuery`
 *
 * Cache invalidation strategy:
 *   - Campaign mutations invalidate `["offline-checkin-campaigns"]`.
 *   - Spot mutations invalidate the *campaign-scoped* spots key
 *     `["offline-checkin-spots", campaignId]` so a spot edit doesn't
 *     blow away every campaign's spot cache.
 *   - check-in mutations invalidate progress for the campaign.
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
  CreateCampaignInput,
  CreateSpotInput,
  ManualCodeResponse,
  MintQrTokensResponse,
  OfflineCheckInCampaign,
  OfflineCheckInProgress,
  OfflineCheckInResult,
  OfflineCheckInSpot,
  UpdateCampaignInput,
  UpdateSpotInput,
} from "#/lib/types/offline-check-in"

const CAMPAIGNS_KEY = ["offline-checkin-campaigns"] as const

export const OFFLINE_CHECKIN_CAMPAIGN_FILTER_DEFS: FilterDef[] = []

/** Paginated campaigns — URL-driven via the standard list-search hook. */
export function useOfflineCheckInCampaigns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extra: { status?: string } = {},
) {
  const { status } = extra
  return useListSearch<OfflineCheckInCampaign>({
    route,
    queryKey: [...CAMPAIGNS_KEY, { status: status ?? null }],
    filterDefs: OFFLINE_CHECKIN_CAMPAIGN_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<OfflineCheckInCampaign>>(
        `/api/v1/offline-check-in/campaigns?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          status,
        })}`,
      ),
  })
}

export function useOfflineCheckInCampaign(key: string) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, key],
    queryFn: () =>
      api.get<OfflineCheckInCampaign>(`/api/v1/offline-check-in/campaigns/${key}`),
    enabled: !!key,
  })
}

export function useCreateOfflineCheckInCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      api.post<OfflineCheckInCampaign>(
        "/api/v1/offline-check-in/campaigns",
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  })
}

export function useUpdateOfflineCheckInCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCampaignInput & { id: string }) =>
      api.patch<OfflineCheckInCampaign>(
        `/api/v1/offline-check-in/campaigns/${id}`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  })
}

export function useDeleteOfflineCheckInCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/offline-check-in/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  })
}

// ─── Spots ────────────────────────────────────────────────────────

const spotsKey = (campaignKey: string) =>
  ["offline-checkin-spots", campaignKey] as const

export function useOfflineCheckInSpots(campaignKey: string) {
  return useQuery({
    queryKey: spotsKey(campaignKey),
    queryFn: () =>
      api
        .get<{ items: OfflineCheckInSpot[] }>(
          `/api/v1/offline-check-in/campaigns/${campaignKey}/spots`,
        )
        .then((r) => r.items),
    enabled: !!campaignKey,
  })
}

export function useCreateOfflineCheckInSpot(campaignKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSpotInput) =>
      api.post<OfflineCheckInSpot>(
        `/api/v1/offline-check-in/campaigns/${campaignKey}/spots`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: spotsKey(campaignKey) }),
  })
}

export function useUpdateOfflineCheckInSpot(campaignKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSpotInput & { id: string }) =>
      api.patch<OfflineCheckInSpot>(
        `/api/v1/offline-check-in/spots/${id}`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: spotsKey(campaignKey) }),
  })
}

export function useDeleteOfflineCheckInSpot(campaignKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/offline-check-in/spots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: spotsKey(campaignKey) }),
  })
}

// ─── QR + manual code ─────────────────────────────────────────────

export function useMintQrTokens() {
  return useMutation({
    mutationFn: ({
      spotId,
      count,
      ttlSeconds,
    }: {
      spotId: string
      count: number
      ttlSeconds: number
    }) =>
      api.post<MintQrTokensResponse>(
        `/api/v1/offline-check-in/spots/${spotId}/qr-tokens`,
        { count, ttlSeconds },
      ),
  })
}

export function useRotateManualCode() {
  return useMutation({
    mutationFn: (spotId: string) =>
      api.post<ManualCodeResponse>(
        `/api/v1/offline-check-in/spots/${spotId}/manual-code:rotate`,
        {},
      ),
  })
}

// ─── Progress + admin check-in ────────────────────────────────────

const progressKey = (campaignKey: string) =>
  ["offline-checkin-progress", campaignKey] as const

export function useOfflineCheckInProgress(
  campaignKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
) {
  return useListSearch<OfflineCheckInProgress>({
    route,
    queryKey: progressKey(campaignKey),
    filterDefs: [],
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<OfflineCheckInProgress>>(
        `/api/v1/offline-check-in/campaigns/${campaignKey}/progress?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
        })}`,
      ),
    enabled: !!campaignKey,
  })
}

export function useAdminPerformOfflineCheckIn(campaignKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      endUserId: string
      spotAlias: string
      lat?: number
      lng?: number
      accuracyM?: number
      qrToken?: string
      manualCode?: string
      mediaAssetId?: string | null
      deviceFingerprint?: string
    }) =>
      api.post<OfflineCheckInResult>(
        `/api/v1/offline-check-in/campaigns/${campaignKey}/check-ins`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: progressKey(campaignKey) }),
  })
}
