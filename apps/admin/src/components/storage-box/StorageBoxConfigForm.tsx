import { useForm } from "@tanstack/react-form"

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
import { useCurrencies } from "#/hooks/use-item"
import type {
  CreateStorageBoxConfigInput,
  StorageBoxType,
} from "#/lib/types/storage-box"

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
  const { data: currencies } = useCurrencies()

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
              ? "名称必填"
              : value.length > 200
              ? "最多 200 个字符"
              : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>名称 *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="例如：金币活期"
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
            <Label htmlFor={field.name}>别名</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="例如：gold-savings"
            />
            <p className="text-xs text-muted-foreground">
              可选的 URL 友好 key，小写字母/数字/连字符/下划线。
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>描述</Label>
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
            <Label htmlFor={field.name}>Icon URL</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}
      </form.Field>

      <form.Field name="type">
        {(field) => (
          <div className="space-y-2">
            <Label>类型 *</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as StorageBoxType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demand">活期（随存随取）</SelectItem>
                <SelectItem value="fixed">定期（锁仓）</SelectItem>
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
                      ? "定期必须设置锁仓天数"
                      : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>锁仓天数 *</Label>
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
                    <Label htmlFor={field.name}>允许提前取款（没收利息）</Label>
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
              <Label htmlFor={field.name}>利率 (%)</Label>
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
                按「周期天数」适用。例如 3% / 365 天 = 年化 3%。
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="interestPeriodDays">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>利率周期（天）</Label>
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
            !value || value.length === 0 ? "至少选择 1 种货币" : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label>接收的货币 *</Label>
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
                  暂无货币。先到「物品」页把某个定义标记为「货币」。
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
              <Label htmlFor={field.name}>单笔最小金额</Label>
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
                placeholder="不限"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="maxDeposit">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>单笔最大金额</Label>
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
                placeholder="不限"
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="sortOrder">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>排序</Label>
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
            <Label htmlFor={field.name}>激活</Label>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.canSubmit}>
        {(canSubmit) => (
          <Button type="submit" disabled={!canSubmit || isPending}>
            {isPending ? "保存中..." : (submitLabel ?? "创建")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
