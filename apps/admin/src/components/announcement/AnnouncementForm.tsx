import { useState } from "react"

import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
  CreateAnnouncementInput,
} from "#/lib/types/announcement"

interface AnnouncementFormProps {
  initial?: Announcement
  onSubmit: (values: CreateAnnouncementInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  /** true = show alias read-only (edit mode). */
  aliasLocked?: boolean
}

function toLocalInput(iso: string | null | undefined): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in local time.
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

export function AnnouncementForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
  aliasLocked,
}: AnnouncementFormProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [kind, setKind] = useState<AnnouncementKind>(initial?.kind ?? "modal")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [body, setBody] = useState(initial?.body ?? "")
  const [coverImageUrl, setCoverImageUrl] = useState(
    initial?.coverImageUrl ?? "",
  )
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? "")
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? "")
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0)
  const [severity, setSeverity] = useState<AnnouncementSeverity>(
    initial?.severity ?? "info",
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)
  const [visibleFrom, setVisibleFrom] = useState(
    toLocalInput(initial?.visibleFrom),
  )
  const [visibleUntil, setVisibleUntil] = useState(
    toLocalInput(initial?.visibleUntil),
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      alias: alias.trim(),
      kind,
      title: title.trim(),
      body,
      coverImageUrl: coverImageUrl.trim() ? coverImageUrl.trim() : null,
      ctaUrl: ctaUrl.trim() ? ctaUrl.trim() : null,
      ctaLabel: ctaLabel.trim() ? ctaLabel.trim() : null,
      priority,
      severity,
      isActive,
      visibleFrom: toIsoOrNull(visibleFrom),
      visibleUntil: toIsoOrNull(visibleUntil),
    })
  }

  const canSubmit =
    alias.trim().length > 0 &&
    title.trim().length > 0 &&
    body.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_basic()}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="alias">{m.announcement_field_alias()}</Label>
            <Input
              id="alias"
              required
              readOnly={aliasLocked}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="maintenance-2026-04-19"
            />
            <p className="text-xs text-muted-foreground">
              {m.announcement_field_alias_hint()}
            </p>
          </div>
          <div className="space-y-1">
            <Label>{m.announcement_field_kind()}</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as AnnouncementKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modal">
                  {m.announcement_kind_modal()}
                </SelectItem>
                <SelectItem value="feed">
                  {m.announcement_kind_feed()}
                </SelectItem>
                <SelectItem value="ticker">
                  {m.announcement_kind_ticker()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="title">{m.announcement_field_title()}</Label>
          <Input
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="body">{m.announcement_field_body()}</Label>
          <Textarea
            id="body"
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={m.announcement_field_body_placeholder()}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_display()}
        </h2>

        <div className="space-y-1">
          <Label>{m.announcement_field_cover()}</Label>
          <MediaPickerDialog
            value={coverImageUrl || null}
            onChange={setCoverImageUrl}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="ctaUrl">{m.announcement_field_cta_url()}</Label>
            <Input
              id="ctaUrl"
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://example.com/event"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ctaLabel">
              {m.announcement_field_cta_label()}
            </Label>
            <Input
              id="ctaLabel"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder={m.announcement_field_cta_label_placeholder()}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{m.announcement_field_severity()}</Label>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as AnnouncementSeverity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">
                  {m.announcement_severity_info()}
                </SelectItem>
                <SelectItem value="warning">
                  {m.announcement_severity_warning()}
                </SelectItem>
                <SelectItem value="urgent">
                  {m.announcement_severity_urgent()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="priority">
              {m.announcement_field_priority()}
            </Label>
            <Input
              id="priority"
              type="number"
              min={-1000}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              {m.announcement_field_priority_hint()}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_schedule()}
        </h2>

        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="active" className="cursor-pointer">
            {m.announcement_field_active()}
          </Label>
          <Switch
            id="active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="visibleFrom">
              {m.announcement_field_visible_from()}
            </Label>
            <Input
              id="visibleFrom"
              type="datetime-local"
              value={visibleFrom}
              onChange={(e) => setVisibleFrom(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {m.announcement_field_visible_from_hint()}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="visibleUntil">
              {m.announcement_field_visible_until()}
            </Label>
            <Input
              id="visibleUntil"
              type="datetime-local"
              value={visibleUntil}
              onChange={(e) => setVisibleUntil(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {m.announcement_field_visible_until_hint()}
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
