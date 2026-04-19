import type { announcements } from "../../schema/announcement";

export type Announcement = typeof announcements.$inferSelect;

export const ANNOUNCEMENT_KINDS = ["modal", "feed", "ticker"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_SEVERITIES = ["info", "warning", "urgent"] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

/**
 * Announcement as rendered for an end user. Operator-only columns
 * (`platforms` / `locales` / `isActive` / `visibleFrom` / `visibleUntil` /
 * `createdBy` / `updatedAt`) are stripped to avoid leaking scheduling
 * bookkeeping into client payloads.
 */
export type ClientAnnouncement = {
  id: string;
  alias: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  coverImageUrl: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  priority: number;
  severity: AnnouncementSeverity;
  createdAt: string;
};
