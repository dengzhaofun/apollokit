/**
 * Admin-side type mirrors for the offline-check-in module.
 *
 * Mirrors `apps/server/src/modules/offline-check-in/types.ts` and the
 * OpenAPI response shapes — fields are wire-format (Date → string).
 *
 * Keeping the union literals in sync between admin and server matters
 * because TanStack Form uses these literal types to drive Select
 * options. If the server expands the enum, regenerate by hand here.
 */

import type { RewardEntry } from "./rewards"

export type OfflineCheckInMode = "collect" | "daily"
export type OfflineCheckInStatus = "draft" | "published" | "active" | "ended"

export type OfflineCheckInCompletionRule =
  | { kind: "all" }
  | { kind: "n_of_m"; n: number }
  | { kind: "daily_total"; days: number }

export type OfflineCheckInVerificationMethod =
  | { kind: "gps"; radiusM: number }
  | { kind: "qr"; mode: "static" | "one_time" }
  | { kind: "manual_code"; staffOnly?: boolean }
  | { kind: "photo"; required?: boolean }

export type OfflineCheckInVerification = {
  methods: OfflineCheckInVerificationMethod[]
  combinator: "any" | "all"
}

export type VerifiedKind = "gps" | "qr" | "manual_code" | "photo"

export interface OfflineCheckInCampaign {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  bannerImage: string | null
  mode: OfflineCheckInMode
  completionRule: OfflineCheckInCompletionRule
  completionRewards: RewardEntry[]
  startAt: string | null
  endAt: string | null
  timezone: string
  status: OfflineCheckInStatus
  collectionAlbumId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface OfflineCheckInSpot {
  id: string
  campaignId: string
  organizationId: string
  alias: string
  name: string
  description: string | null
  coverImage: string | null
  latitude: number
  longitude: number
  geofenceRadiusM: number
  verification: OfflineCheckInVerification
  spotRewards: RewardEntry[]
  collectionEntryAliases: string[]
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface OfflineCheckInProgress {
  campaignId: string
  endUserId: string
  organizationId: string
  spotsCompleted: string[]
  totalCount: number
  lastSpotId: string | null
  lastCheckInAt: string | null
  dailyCount: number
  dailyDates: string[]
  completedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface OfflineCheckInResult {
  accepted: boolean
  granted: RewardEntry[]
  justCompleted: boolean
  verifiedVia: VerifiedKind[]
  progress: OfflineCheckInProgress
  distanceM: number | null
  rejectReason: string | null
}

export interface CreateCampaignInput {
  name: string
  alias?: string | null
  description?: string | null
  bannerImage?: string | null
  mode: OfflineCheckInMode
  completionRule: OfflineCheckInCompletionRule
  completionRewards?: RewardEntry[]
  startAt?: string | null
  endAt?: string | null
  timezone?: string
  collectionAlbumId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateCampaignInput {
  name?: string
  alias?: string | null
  description?: string | null
  bannerImage?: string | null
  completionRule?: OfflineCheckInCompletionRule
  completionRewards?: RewardEntry[]
  startAt?: string | null
  endAt?: string | null
  timezone?: string
  status?: OfflineCheckInStatus
  collectionAlbumId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CreateSpotInput {
  alias: string
  name: string
  description?: string | null
  coverImage?: string | null
  latitude: number
  longitude: number
  geofenceRadiusM?: number
  verification: OfflineCheckInVerification
  spotRewards?: RewardEntry[]
  collectionEntryAliases?: string[]
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateSpotInput {
  alias?: string
  name?: string
  description?: string | null
  coverImage?: string | null
  latitude?: number
  longitude?: number
  geofenceRadiusM?: number
  verification?: OfflineCheckInVerification
  spotRewards?: RewardEntry[]
  collectionEntryAliases?: string[]
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface MintQrTokensResponse {
  tokens: string[]
  expiresAt: string
}

export interface ManualCodeResponse {
  code: string
  rotatesAt: string
}
