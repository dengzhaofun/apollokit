import { useState } from "react"

import { LinkActionEditor } from "#/components/common/LinkActionEditor"
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
  Banner,
  BannerTargetType,
  CreateBannerInput,
} from "#/lib/types/banner"
import type { LinkAction } from "#/lib/types/link"
import { validateLinkAction } from "#/lib/types/link"

interface BannerFormProps {
  initial?: Banner
  onSubmit: (values: CreateBannerInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

/**
 * Converts the raw value of an `<input type="datetime-local">` (always in
 * local time) to an ISO-8601 string the backend accepts, or null.
 */
function localInputToIso(input: string): string | null {
  if (!input) return null
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // yyyy-MM-ddTHH:mm (local). Keep seconds off to match datetime-local input.
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BannerForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: BannerFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [imageUrlMobile, setImageUrlMobile] = useState(
    initial?.imageUrlMobile ?? "",
  )
  const [imageUrlDesktop, setImageUrlDesktop] = useState(
    initial?.imageUrlDesktop ?? "",
  )
  const [altText, setAltText] = useState(initial?.altText ?? "")
  const [linkAction, setLinkAction] = useState<LinkAction>(
    initial?.linkAction ?? { type: "none" },
  )
  const [sortOrder, setSortOrder] = useState<number>(
    initial?.sortOrder ?? 0,
  )
  const [visibleFrom, setVisibleFrom] = useState(
    isoToLocalInput(initial?.visibleFrom ?? null),
  )
  const [visibleUntil, setVisibleUntil] = useState(
    isoToLocalInput(initial?.visibleUntil ?? null),
  )
  const [targetType, setTargetType] = useState<BannerTargetType>(
    initial?.targetType ?? "broadcast",
  )
  const [targetUserIdsRaw, setTargetUserIdsRaw] = useState(
    (initial?.targetUserIds ?? []).join("\n"),
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const linkErr = validateLinkAction(linkAction)
    if (linkErr) {
      setError(linkErr)
      return
    }

    let targetUserIds: string[] | null = null
    if (targetType === "multicast") {
      targetUserIds = targetUserIdsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (targetUserIds.length === 0) {
        setError(m.mail_error_recipients_required())
        return
      }
    }

    await onSubmit({
      title: title.trim(),
      imageUrlMobile: imageUrlMobile.trim(),
      imageUrlDesktop: imageUrlDesktop.trim(),
      altText: altText.trim() ? altText : null,
      linkAction,
      sortOrder,
      visibleFrom: localInputToIso(visibleFrom),
      visibleUntil: localInputToIso(visibleUntil),
      targetType,
      targetUserIds,
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <Label htmlFor="title">{m.banner_field_banner_title()}</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>{m.banner_field_image_mobile()}</Label>
          <MediaPickerDialog
            value={imageUrlMobile || null}
            onChange={setImageUrlMobile}
          />
        </div>
        <div className="space-y-1">
          <Label>{m.banner_field_image_desktop()}</Label>
          <MediaPickerDialog
            value={imageUrlDesktop || null}
            onChange={setImageUrlDesktop}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="alt">{m.banner_field_alt_text()}</Label>
        <Input
          id="alt"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
        />
      </div>

      <LinkActionEditor value={linkAction} onChange={setLinkAction} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="sort">{m.banner_field_sort_order()}</Label>
          <Input
            id="sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="visible-from">
            {m.banner_field_visible_from()}
          </Label>
          <Input
            id="visible-from"
            type="datetime-local"
            value={visibleFrom}
            onChange={(e) => setVisibleFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="visible-until">
            {m.banner_field_visible_until()}
          </Label>
          <Input
            id="visible-until"
            type="datetime-local"
            value={visibleUntil}
            onChange={(e) => setVisibleUntil(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <Label>{m.banner_field_target_type()}</Label>
        <Select
          value={targetType}
          onValueChange={(v) => setTargetType(v as BannerTargetType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broadcast">
              {m.banner_target_broadcast()}
            </SelectItem>
            <SelectItem value="multicast">
              {m.banner_target_multicast()}
            </SelectItem>
          </SelectContent>
        </Select>
        {targetType === "multicast" ? (
          <div className="space-y-1">
            <Label htmlFor="target-users" className="text-xs">
              {m.banner_field_target_user_ids()}
            </Label>
            <Textarea
              id="target-users"
              rows={3}
              value={targetUserIdsRaw}
              onChange={(e) => setTargetUserIdsRaw(e.target.value)}
              placeholder="user-1&#10;user-2"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="active" className="cursor-pointer">
          {m.banner_field_active()}
        </Label>
        <Switch
          id="active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            isPending ||
            !title.trim() ||
            !imageUrlMobile.trim() ||
            !imageUrlDesktop.trim()
          }
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
