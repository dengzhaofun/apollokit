export type AnnouncementKind = "modal" | "feed" | "ticker"
export type AnnouncementSeverity = "info" | "warning" | "urgent"

export interface Announcement {
  id: string
  organizationId: string
  alias: string
  kind: AnnouncementKind
  title: string
  body: string
  coverImageUrl: string | null
  ctaUrl: string | null
  ctaLabel: string | null
  priority: number
  severity: AnnouncementSeverity
  isActive: boolean
  visibleFrom: string | null
  visibleUntil: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAnnouncementInput {
  alias: string
  kind: AnnouncementKind
  title: string
  body: string
  coverImageUrl?: string | null
  ctaUrl?: string | null
  ctaLabel?: string | null
  priority?: number
  severity?: AnnouncementSeverity
  isActive?: boolean
  visibleFrom?: string | null
  visibleUntil?: string | null
}

export type UpdateAnnouncementInput = Partial<
  Omit<CreateAnnouncementInput, "alias">
>

export interface AnnouncementListResponse {
  items: Announcement[]
}

export interface AnnouncementListFilter {
  kind?: AnnouncementKind
  isActive?: boolean
  q?: string
}
