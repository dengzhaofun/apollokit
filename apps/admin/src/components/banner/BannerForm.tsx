import { useForm } from "@tanstack/react-form"

import { LinkActionEditor } from "#/components/common/LinkActionEditor"
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
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

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
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const NULL_LINK_ACTION: LinkAction = { type: "none" }

export function BannerForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
  id,
  hideSubmitButton,
  onStateChange,
}: BannerFormProps) {
  const form = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      imageUrlMobile: initial?.imageUrlMobile ?? "",
      imageUrlDesktop: initial?.imageUrlDesktop ?? "",
      altText: initial?.altText ?? "",
      linkAction: (initial?.linkAction ?? NULL_LINK_ACTION) as LinkAction,
      sortOrder: initial?.sortOrder ?? 0,
      visibleFrom: isoToLocalInput(initial?.visibleFrom ?? null),
      visibleUntil: isoToLocalInput(initial?.visibleUntil ?? null),
      targetType: (initial?.targetType ?? "broadcast") as BannerTargetType,
      targetUserIdsRaw: (initial?.targetUserIds ?? []).join("\n"),
      isActive: initial?.isActive ?? true,
      formError: "",
    },
    onSubmit: async ({ value, formApi }) => {
      formApi.setFieldValue("formError", "")

      const linkErr = validateLinkAction(value.linkAction)
      if (linkErr) {
        formApi.setFieldValue("formError", linkErr)
        return
      }

      let targetUserIds: string[] | null = null
      if (value.targetType === "multicast") {
        targetUserIds = value.targetUserIdsRaw
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (targetUserIds.length === 0) {
          formApi.setFieldValue("formError", m.mail_error_recipients_required())
          return
        }
      }

      await onSubmit({
        title: value.title.trim(),
        imageUrlMobile: value.imageUrlMobile.trim(),
        imageUrlDesktop: value.imageUrlDesktop.trim(),
        altText: value.altText.trim() ? value.altText : null,
        linkAction: value.linkAction,
        sortOrder: value.sortOrder,
        visibleFrom: localInputToIso(value.visibleFrom),
        visibleUntil: localInputToIso(value.visibleUntil),
        targetType: value.targetType,
        targetUserIds,
        isActive: value.isActive,
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
      className="space-y-5"
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

      <form.Field
        name="title"
        validators={{
          onChange: ({ value }) => (!value.trim() ? "Title is required" : undefined),
        }}
      >
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="title">{m.banner_field_banner_title()}</Label>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field
          name="imageUrlMobile"
          validators={{
            onChange: ({ value }) =>
              !value.trim() ? "Mobile image required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1">
              <Label>{m.banner_field_image_mobile()}</Label>
              <MediaPickerDialog
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url)}
              />
            </div>
          )}
        </form.Field>

        <form.Field
          name="imageUrlDesktop"
          validators={{
            onChange: ({ value }) =>
              !value.trim() ? "Desktop image required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1">
              <Label>{m.banner_field_image_desktop()}</Label>
              <MediaPickerDialog
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="altText">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="alt">{m.banner_field_alt_text()}</Label>
            <Input
              id="alt"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="linkAction">
        {(field) => (
          <LinkActionEditor
            value={field.state.value}
            onChange={(v) => field.handleChange(v)}
          />
        )}
      </form.Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <form.Field name="sortOrder">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="sort">{m.banner_field_sort_order()}</Label>
              <Input
                id="sort"
                type="number"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value) || 0)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="visibleFrom">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="from">{m.banner_field_visible_from()}</Label>
              <Input
                id="from"
                type="datetime-local"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="visibleUntil">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="until">{m.banner_field_visible_until()}</Label>
              <Input
                id="until"
                type="datetime-local"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="targetType">
        {(field) => (
          <div className="space-y-1">
            <Label>{m.banner_field_target_type()}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as BannerTargetType)}
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
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.targetType}>
        {(targetType) =>
          targetType === "multicast" ? (
            <form.Field name="targetUserIdsRaw">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="user-ids">
                    {m.banner_field_target_user_ids()}
                  </Label>
                  <Textarea
                    id="user-ids"
                    rows={4}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="user-1, user-2&#10;user-3"
                  />
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="active" className="cursor-pointer">
              {m.banner_field_active()}
            </Label>
            <Switch
              id="active"
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.formError}>
        {(formError) =>
          formError ? <p className="text-sm text-destructive">{formError}</p> : null
        }
      </form.Subscribe>

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
