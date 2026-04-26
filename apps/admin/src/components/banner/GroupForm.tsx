import { useForm } from "@tanstack/react-form"

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
  BannerGroup,
  BannerLayout,
  CreateBannerGroupInput,
} from "#/lib/types/banner"

interface GroupFormProps {
  initial?: BannerGroup
  defaultValues?: Partial<CreateBannerGroupInput>
  onSubmit: (values: CreateBannerGroupInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function GroupForm({
  initial,
  defaultValues,
  onSubmit,
  submitLabel,
  isPending,
  id,
  hideSubmitButton,
  onStateChange,
}: GroupFormProps) {
  const activityId = defaultValues?.activityId ?? initial?.activityId ?? null

  const form = useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? initial?.alias ?? "",
      name: defaultValues?.name ?? initial?.name ?? "",
      description: defaultValues?.description ?? initial?.description ?? "",
      layout:
        (defaultValues?.layout as BannerLayout | undefined) ??
        (initial?.layout as BannerLayout | undefined) ??
        ("carousel" as BannerLayout),
      intervalMs: defaultValues?.intervalMs ?? initial?.intervalMs ?? 4000,
      isActive: defaultValues?.isActive ?? initial?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        alias: value.alias.trim() ? value.alias.trim() : null,
        name: value.name.trim(),
        description: value.description.trim() ? value.description : null,
        layout: value.layout,
        intervalMs: value.intervalMs,
        isActive: value.isActive,
        activityId,
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
      className="space-y-4"
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

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="alias">{m.banner_field_alias()}</Label>
            <Input
              id="alias"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="home-main"
            />
            <p className="text-xs text-muted-foreground">
              {m.banner_field_alias_hint()}
            </p>
          </div>
        )}
      </form.Field>

      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => (!value.trim() ? "Name is required" : undefined),
        }}
      >
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="name">{m.banner_field_name()}</Label>
            <Input
              id="name"
              required
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="description">{m.banner_field_description()}</Label>
            <Textarea
              id="description"
              rows={2}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="layout">
          {(field) => (
            <div className="space-y-1">
              <Label>{m.banner_field_layout()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as BannerLayout)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carousel">{m.banner_layout_carousel()}</SelectItem>
                  <SelectItem value="single">{m.banner_layout_single()}</SelectItem>
                  <SelectItem value="grid">{m.banner_layout_grid()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="intervalMs">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="interval">{m.banner_field_interval()}</Label>
              <Input
                id="interval"
                type="number"
                min={500}
                max={60000}
                step={500}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(Number(e.target.value) || 4000)
                }
              />
            </div>
          )}
        </form.Field>
      </div>

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
