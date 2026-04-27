import { useForm } from "@tanstack/react-form"

import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
  CreateAnnouncementInput,
} from "#/lib/types/announcement"

export type AnnouncementFormValues = {
  alias: string
  kind: AnnouncementKind
  title: string
  body: string
  coverImageUrl: string
  ctaUrl: string
  ctaLabel: string
  priority: number
  severity: AnnouncementSeverity
  isActive: boolean
  visibleFrom: string
  visibleUntil: string
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function buildAnnouncementDefaults(
  initial?: Announcement,
): AnnouncementFormValues {
  return {
    alias: initial?.alias ?? "",
    kind: (initial?.kind ?? "modal") as AnnouncementKind,
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    coverImageUrl: initial?.coverImageUrl ?? "",
    ctaUrl: initial?.ctaUrl ?? "",
    ctaLabel: initial?.ctaLabel ?? "",
    priority: initial?.priority ?? 0,
    severity: (initial?.severity ?? "info") as AnnouncementSeverity,
    isActive: initial?.isActive ?? true,
    visibleFrom: toLocalInput(initial?.visibleFrom),
    visibleUntil: toLocalInput(initial?.visibleUntil),
  }
}

export function toCreateAnnouncementInput(
  value: AnnouncementFormValues,
): CreateAnnouncementInput {
  return {
    alias: value.alias.trim(),
    kind: value.kind,
    title: value.title.trim(),
    body: value.body,
    coverImageUrl: value.coverImageUrl.trim() ? value.coverImageUrl.trim() : null,
    ctaUrl: value.ctaUrl.trim() ? value.ctaUrl.trim() : null,
    ctaLabel: value.ctaLabel.trim() ? value.ctaLabel.trim() : null,
    priority: value.priority,
    severity: value.severity,
    isActive: value.isActive,
    visibleFrom: toIsoOrNull(value.visibleFrom),
    visibleUntil: toIsoOrNull(value.visibleUntil),
  }
}

export function useAnnouncementForm({
  initial,
  onSubmit,
}: {
  initial?: Announcement
  onSubmit: (values: CreateAnnouncementInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: buildAnnouncementDefaults(initial),
    onSubmit: async ({ value }) => {
      await onSubmit(toCreateAnnouncementInput(value))
    },
  })
}

export type AnnouncementFormApi = ReturnType<typeof useAnnouncementForm>
