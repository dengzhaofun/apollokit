import { useForm } from "@tanstack/react-form"

import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
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
import { useAllCurrencies } from "#/hooks/use-currency"
import type {
  CreateStorageBoxConfigInput,
  StorageBoxType,
} from "#/lib/types/storage-box"
import * as m from "#/paraglide/messages.js"

interface Props {
  defaultValues?: Partial<CreateStorageBoxConfigInput>
  onSubmit: (values: CreateStorageBoxConfigInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function StorageBoxConfigForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: Props) {
  const { data: currencies } = useAllCurrencies()

  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      type: (defaultValues?.type ?? "demand") as StorageBoxType,
      lockupDays: defaultValues?.lockupDays ?? (null as number | null),
      // Rate input is shown as a percentage; converted to bps on submit.
      ratePercent:
        defaultValues?.interestRateBps != null
          ? defaultValues.interestRateBps / 100
          : 0,
      interestPeriodDays: defaultValues?.interestPeriodDays ?? 365,
      acceptedCurrencyIds: defaultValues?.acceptedCurrencyIds ?? ([] as string[]),
      minDeposit: defaultValues?.minDeposit ?? (null as number | null),
      maxDeposit: defaultValues?.maxDeposit ?? (null as number | null),
      allowEarlyWithdraw: defaultValues?.allowEarlyWithdraw ?? false,
      sortOrder: defaultValues?.sortOrder ?? 0,
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreateStorageBoxConfigInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        icon: value.icon || null,
        type: value.type,
        lockupDays: value.type === "fixed" ? value.lockupDays : null,
        interestRateBps: Math.round(value.ratePercent * 100),
        interestPeriodDays: value.interestPeriodDays,
        acceptedCurrencyIds: value.acceptedCurrencyIds,
        minDeposit: value.minDeposit,
        maxDeposit: value.maxDeposit,
        allowEarlyWithdraw: value.allowEarlyWithdraw,
        sortOrder: value.sortOrder,
        isActive: value.isActive,
      }
      await onSubmit(input)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value
              ? m.storage_box_validation_name_required()
              : value.length > 200
              ? m.storage_box_validation_name_max()
              : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.storage_box_field_name_placeholder()}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_alias()}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.storage_box_field_alias_placeholder()}
            />
            <p className="text-xs text-muted-foreground">
              {m.storage_box_field_alias_hint()}
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_description()}</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="icon">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_icon()}</Label>
            <MediaPickerDialog
              value={field.state.value || null}
              onChange={(url) => field.handleChange(url)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="type">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_type()} *</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as StorageBoxType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demand">{m.storage_box_type_demand_long()}</SelectItem>
                <SelectItem value="fixed">{m.storage_box_type_fixed_long()}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.type}>
        {(type) =>
          type === "fixed" ? (
            <>
              <form.Field
                name="lockupDays"
                validators={{
                  onChange: ({ value }) =>
                    value == null || value <= 0
                      ? m.storage_box_validation_lock_days_required()
                      : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{m.storage_box_field_lock_days()} *</Label>
                    <Input
                      id={field.name}
                      type="number"
                      min={1}
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-sm text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field name="allowEarlyWithdraw">
                {(field) => (
                  <div className="flex items-center gap-3">
                    <Switch
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                    <Label htmlFor={field.name}>{m.storage_box_field_early_withdraw_label()}</Label>
                  </div>
                )}
              </form.Field>
            </>
          ) : null
        }
      </form.Subscribe>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field name="ratePercent">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.storage_box_field_interest_rate_label()}</Label>
              <Input
                id={field.name}
                type="number"
                min={0}
                step="0.01"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {m.storage_box_field_interest_hint()}
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="interestPeriodDays">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.storage_box_field_interest_period()}</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field
        name="acceptedCurrencyIds"
        validators={{
          onChange: ({ value }) =>
            !value || value.length === 0
              ? m.storage_box_validation_currency_required()
              : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label>{m.storage_box_field_currencies()} *</Label>
            <div className="space-y-1 rounded-md border p-3">
              {currencies && currencies.length > 0 ? (
                currencies.map((c) => {
                  const checked = field.state.value.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 py-1"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v
                            ? [...field.state.value, c.id]
                            : field.state.value.filter((id) => id !== c.id)
                          field.handleChange(next)
                        }}
                      />
                      <span className="text-sm">{c.name}</span>
                      {c.alias && (
                        <Badge variant="outline" className="text-xs">
                          {c.alias}
                        </Badge>
                      )}
                    </label>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  {m.storage_box_no_currencies_hint()}
                </p>
              )}
            </div>
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field name="minDeposit">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.storage_box_field_min_amount()}</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                placeholder={m.common_unlimited()}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="maxDeposit">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.storage_box_field_max_amount()}</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                placeholder={m.common_unlimited()}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="sortOrder">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_sort_order()}</Label>
            <Input
              id={field.name}
              type="number"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(Number(e.target.value) || 0)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={field.name}>{m.storage_box_field_active()}</Label>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.canSubmit}>
        {(canSubmit) => (
          <Button type="submit" disabled={!canSubmit || isPending}>
            {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
