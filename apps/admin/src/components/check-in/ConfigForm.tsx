import { useForm } from "@tanstack/react-form"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type {
  CreateConfigInput,
  ResetMode,
} from "#/lib/types/check-in"

const TIMEZONES = Intl.supportedValuesOf("timeZone")

const RESET_MODE_LABELS: Record<ResetMode, string> = {
  none: "None (cumulative)",
  week: "Weekly",
  month: "Monthly",
}

const WEEK_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

interface ConfigFormProps {
  defaultValues?: Partial<CreateConfigInput>
  onSubmit: (values: CreateConfigInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function ConfigForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "Create",
}: ConfigFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      resetMode: defaultValues?.resetMode ?? ("none" as ResetMode),
      weekStartsOn: defaultValues?.weekStartsOn ?? 1,
      target: defaultValues?.target ?? (null as number | null),
      timezone: defaultValues?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreateConfigInput = {
        name: value.name,
        resetMode: value.resetMode,
        weekStartsOn: value.weekStartsOn,
        timezone: value.timezone,
        isActive: value.isActive,
        alias: value.alias || null,
        description: value.description || null,
        target: value.target,
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
            !value ? "Name is required" : value.length > 200 ? "Max 200 characters" : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Name *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Daily Check-In"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Alias</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. daily"
            />
            <p className="text-xs text-muted-foreground">
              Optional URL-friendly key. Lowercase letters, digits, hyphens, underscores.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Description</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="resetMode">
        {(field) => (
          <div className="space-y-2">
            <Label>Reset Mode *</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as ResetMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RESET_MODE_LABELS) as ResetMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {RESET_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How the check-in cycle resets: never, weekly, or monthly.
            </p>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.resetMode}>
        {(resetMode) =>
          resetMode === "week" ? (
            <form.Field name="weekStartsOn">
              {(field) => (
                <div className="space-y-2">
                  <Label>Week Starts On</Label>
                  <Select
                    value={String(field.state.value)}
                    onValueChange={(v) => field.handleChange(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEK_DAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="target">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Target (days)</Label>
            <Input
              id={field.name}
              type="number"
              min={1}
              value={field.state.value ?? ""}
              onBlur={field.handleBlur}
              onChange={(e) =>
                field.handleChange(e.target.value ? Number(e.target.value) : null)
              }
              placeholder="Optional goal per cycle"
            />
            <p className="text-xs text-muted-foreground">
              Optional per-cycle goal. Leave empty for no target.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="timezone">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Timezone</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label htmlFor={field.name}>Active</Label>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.canSubmit}>
        {(canSubmit) => (
          <Button type="submit" disabled={!canSubmit || isPending}>
            {isPending ? "Saving..." : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
