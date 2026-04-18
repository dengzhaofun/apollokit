import type { RewardEntry } from "./rewards"

export type MailTargetType = "broadcast" | "multicast"

export interface MailMessage {
  id: string
  organizationId: string
  title: string
  content: string
  rewards: RewardEntry[]
  targetType: MailTargetType
  targetUserIds: string[] | null
  requireRead: boolean
  senderAdminId: string | null
  sentAt: string
  expiresAt: string | null
  revokedAt: string | null
  originSource: string | null
  originSourceId: string | null
  createdAt: string
  updatedAt: string
}

export interface MailMessageWithStats extends MailMessage {
  readCount: number
  claimCount: number
  targetCount: number | null
}

export interface CreateMailInput {
  title: string
  content: string
  rewards: RewardEntry[]
  targetType: MailTargetType
  targetUserIds?: string[]
  requireRead?: boolean
  expiresAt?: string | null
}

export interface MailListResponse {
  items: MailMessage[]
  nextCursor: string | null
}
