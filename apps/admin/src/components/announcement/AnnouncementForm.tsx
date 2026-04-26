import { useForm } from "@tanstack/react-form"

import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Button } from "#/components/ui/button"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
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
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
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

export function AnnouncementForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
  aliasLocked,
  id,
  hideSubmitButton,
  onStateChange,
}: AnnouncementFormProps) {
  const form = useForm({
    defaultValues: {
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
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
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
      })
    },
  })

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {onStateChange ? (
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => <FormStateBridge state={state} onChange={onStateChange} />}
        </form.Subscribe>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_basic()}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <form.Field
            name="alias"
            validators={{
              onChange: ({ value }) =>
                !value.trim() ? "Alias required" : undefined,
            }}
          >
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="alias">{m.announcement_field_alias()}</Label>
                <Input
                  id="alias"
                  required
                  readOnly={aliasLocked}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="maintenance-2026-04-19"
                />
                <p className="text-xs text-muted-foreground">
                  {m.announcement_field_alias_hint()}
                </p>
              </div>
            )}
          </form.Field>
          <form.Field name="kind">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.announcement_field_kind()}</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as AnnouncementKind)}
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
            )}
          </form.Field>
        </div>

        <form.Field
          name="title"
          validators={{
            onChange: ({ value }) =>
              !value.trim() ? "Title required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="title">{m.announcement_field_title()}</Label>
              <Input
                id="title"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field
          name="body"
          validators={{
            onChange: ({ value }) =>
              !value.trim() ? "Body required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="body">{m.announcement_field_body()}</Label>
              <Textarea
                id="body"
                required
                rows={8}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={m.announcement_field_body_placeholder()}
              />
            </div>
          )}
        </form.Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_display()}
        </h2>

        <form.Field name="coverImageUrl">
          {(field) => (
            <div className="space-y-1">
              <Label>{m.announcement_field_cover()}</Label>
              <MediaPickerDialog
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url)}
              />
            </div>
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-4">
          <form.Field name="ctaUrl">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="ctaUrl">{m.announcement_field_cta_url()}</Label>
                <Input
                  id="ctaUrl"
                  type="url"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="https://example.com/event"
                />
              </div>
            )}
          </form.Field>
          <form.Field name="ctaLabel">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="ctaLabel">
                  {m.announcement_field_cta_label()}
                </Label>
                <Input
                  id="ctaLabel"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={m.announcement_field_cta_label_placeholder()}
                />
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <form.Field name="severity">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.announcement_field_severity()}</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) =>
                    field.handleChange(v as AnnouncementSeverity)
                  }
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
            )}
          </form.Field>
          <form.Field name="priority">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="priority">
                  {m.announcement_field_priority()}
                </Label>
                <Input
                  id="priority"
                  type="number"
                  min={-1000}
                  max={1000}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  {m.announcement_field_priority_hint()}
                </p>
              </div>
            )}
          </form.Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.announcement_section_schedule()}
        </h2>

        <form.Field name="isActive">
          {(field) => (
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="active" className="cursor-pointer">
                {m.announcement_field_active()}
              </Label>
              <Switch
                id="active"
                checked={field.state.value}
                onCheckedChange={(v) => field.handleChange(v === true)}
              />
            </div>
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-4">
          <form.Field name="visibleFrom">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="visibleFrom">
                  {m.announcement_field_visible_from()}
                </Label>
                <Input
                  id="visibleFrom"
                  type="datetime-local"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {m.announcement_field_visible_from_hint()}
                </p>
              </div>
            )}
          </form.Field>
          <form.Field name="visibleUntil">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="visibleUntil">
                  {m.announcement_field_visible_until()}
                </Label>
                <Input
                  id="visibleUntil"
                  type="datetime-local"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {m.announcement_field_visible_until_hint()}
                </p>
              </div>
            )}
          </form.Field>
        </div>
      </section>

      {hideSubmitButton ? null : (
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !canSubmit}>
                {submitLabel}
              </Button>
            </div>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
