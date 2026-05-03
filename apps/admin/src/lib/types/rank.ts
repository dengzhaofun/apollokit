/**
 * TypeScript types for the rank admin API.
 *
 * Mirror of server-side Zod response schemas in
 * `apps/server/src/modules/rank/validators.ts`. We intentionally hand-
 * maintain these instead of generating from OpenAPI so the admin UI has
 * a stable surface even during server refactors.
 */

export type RankSeasonStatus = "upcoming" | "active" | "finished"

export type RankTeamMode = "avgTeamElo"

export interface RankRatingParams {
  strategy: "elo" | "glicko2"
  baseK?: number
  teamMode?: RankTeamMode
  perfWeight?: number
  initialMmr?: number
  [k: string]: unknown
}

export interface RankTierProtectionRules {
  demotionShieldMatches?: number
  bigDropShields?: number
  winStreakBonusFrom?: number
  [k: string]: unknown
}

export interface RankTier {
  id: string
  tierConfigId: string
  alias: string
  name: string
  order: number
  minRankScore: number
  maxRankScore: number | null
  subtierCount: number
  starsPerSubtier: number
  protectionRules: RankTierProtectionRules
  metadata: Record<string, unknown> | null
}

export interface RankTierConfig {
  id: string
  tenantId: string
  alias: string
  name: string
  description: string | null
  version: number
  isActive: boolean
  ratingParams: RankRatingParams
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  tiers: RankTier[]
}

export interface RankTierConfigListResponse {
  items: RankTierConfig[]
}

export interface RankTierInput {
  alias: string
  name: string
  order: number
  minRankScore: number
  maxRankScore?: number | null
  subtierCount?: number
  starsPerSubtier?: number
  protectionRules?: RankTierProtectionRules
  metadata?: Record<string, unknown> | null
}

export interface CreateRankTierConfigInput {
  alias: string
  name: string
  description?: string | null
  ratingParams: RankRatingParams
  tiers: RankTierInput[]
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export type UpdateRankTierConfigInput = Partial<
  Omit<CreateRankTierConfigInput, "alias">
> & { alias?: string }

export interface RankSeason {
  id: string
  tenantId: string
  tierConfigId: string
  alias: string
  name: string
  description: string | null
  startAt: string
  endAt: string
  status: RankSeasonStatus
  inheritanceRules: Record<string, unknown>
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface RankSeasonListResponse {
  items: RankSeason[]
}

export interface CreateRankSeasonInput {
  alias: string
  name: string
  description?: string | null
  tierConfigId: string
  startAt: string
  endAt: string
  inheritanceRules?: Record<string, unknown>
  metadata?: Record<string, unknown> | null
}

export type UpdateRankSeasonInput = Partial<
  Omit<CreateRankSeasonInput, "tierConfigId">
> & { status?: RankSeasonStatus }

export interface RankPlayerView {
  seasonId: string
  endUserId: string
  rankScore: number
  mmr: number
  subtier: number
  stars: number
  winStreak: number
  lossStreak: number
  matchesPlayed: number
  wins: number
  losses: number
  protectionUses: Record<string, number>
  lastMatchAt: string | null
  tier: {
    id: string
    alias: string
    name: string
    order: number
    subtierCount: number
    starsPerSubtier: number
  } | null
}

export interface RankPlayerListResponse {
  items: RankPlayerView[]
}

export interface AdjustRankPlayerInput {
  seasonId: string
  rankScore?: number
  mmr?: number
  tierId?: string | null
  subtier?: number
  stars?: number
  reason: string
}

export interface RankFinalizeResult {
  snapshotCount: number
  playerCount: number
}

export interface RankMatchSummary {
  id: string
  externalMatchId: string
  gameMode: string | null
  teamCount: number
  totalParticipants: number
  settledAt: string
}

export interface RankMatchListResponse {
  items: RankMatchSummary[]
  nextCursor?: string
}

export interface RankMatchParticipantDelta {
  id: string
  matchId: string
  endUserId: string
  teamId: string
  placement: number | null
  win: boolean
  mmrBefore: number
  mmrAfter: number
  rankScoreBefore: number
  rankScoreAfter: number
  starsDelta: number
  subtierBefore: number
  subtierAfter: number
  starsBefore: number
  starsAfter: number
  tierBeforeId: string | null
  tierAfterId: string | null
  promoted: boolean
  demoted: boolean
  protectionApplied: Record<string, unknown> | null
}

export interface RankMatchDetail {
  match: RankMatchSummary
  participants: RankMatchParticipantDelta[]
}
