import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { ActivityPicker } from "#/components/activity/ActivityPicker"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type { CreateDefinitionInput, TaskCategory } from "#/lib/types/task"

interface DefinitionFormProps {
  defaultValues?: Partial<CreateDefinitionInput>
  categories?: TaskCategory[]
  onSubmit: (values: CreateDefinitionInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function DefinitionForm({
  defaultValues,
  categories = [],
  onSubmit,
  isPending,
  submitLabel = m.common_create(),
}: DefinitionFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      categoryId: defaultValues?.categoryId ?? "",
      period: defaultValues?.period ?? "daily",
      countingMethod: defaultValues?.countingMethod ?? "event_count",
      eventName: defaultValues?.eventName ?? "",
      eventValueField: defaultValues?.eventValueField ?? "",
      targetValue: defaultValues?.targetValue ?? 1,
      parentProgressValue: defaultValues?.parentProgressValue ?? 1,
      autoClaim: defaultValues?.autoClaim ?? false,
      isActive: defaultValues?.isActive ?? true,
      isHidden: defaultValues?.isHidden ?? false,
      sortOrder: defaultValues?.sortOrder ?? 0,
      activityId: defaultValues?.activityId ?? (null as string | null),
    },
    onSubmit: async ({ value }) => {
      const input: CreateDefinitionInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        categoryId: value.categoryId || null,
        period: value.period as CreateDefinitionInput["period"],
        countingMethod: value.countingMethod as CreateDefinitionInput["countingMethod"],
        eventName: value.eventName || null,
        eventValueField: value.eventValueField || null,
        targetValue: value.targetValue,
        parentProgressValue: value.parentProgressValue,
        autoClaim: value.autoClaim,
        isActive: value.isActive,
        isHidden: value.isHidden,
        sortOrder: value.sortOrder,
        activityId: value.activityId,
        rewards: defaultValues?.rewards ?? [{ type: "item", id: "", count: 1 }],
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
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Win 3 Battles"
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
            <Label htmlFor={field.name}>{m.common_alias()}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. win-3-battles"
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

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="categoryId">
          {(field) => (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="period">
          {(field) => (
            <div className="space-y-2">
              <Label>Period *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="none">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="countingMethod">
          {(field) => (
            <div className="space-y-2">
              <Label>Counting Method *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event_count">Event Count (+1 per event)</SelectItem>
                  <SelectItem value="event_value">Event Value (accumulate field)</SelectItem>
                  <SelectItem value="child_completion">Child Completion (SUM children)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="targetValue">
          {(field) => (
            <div className="space-y-2">
              <Label>Target Value *</Label>
              <Input
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

      <form.Field name="eventName">
        {(field) => (
          <div className="space-y-2">
            <Label>Event Name</Label>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. purchase, login, battle_win"
            />
            <p className="text-xs text-muted-foreground">
              Required for event_count and event_value methods.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="eventValueField">
        {(field) => (
          <div className="space-y-2">
            <Label>Event Value Field</Label>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. amount"
            />
            <p className="text-xs text-muted-foreground">
              Dot-path into event data for event_value counting.
            </p>
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="parentProgressValue">
          {(field) => (
            <div className="space-y-2">
              <Label>Parent Progress Value</Label>
              <Input
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Progress contributed to parent task on completion.
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="sortOrder">
          {(field) => (
            <div className="space-y-2">
              <Label>{m.common_sort_order()}</Label>
              <Input
                type="number"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex items-center gap-6">
        <form.Field name="autoClaim">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="autoClaim"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="autoClaim">Auto-claim via mail</Label>
            </div>
          )}
        </form.Field>

        <form.Field name="isHidden">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="isHidden"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="isHidden">Hidden until prerequisites met</Label>
            </div>
          )}
        </form.Field>

        <form.Field name="isActive">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label htmlFor="isActive">{m.common_active()}</Label>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="activityId">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>关联活动（可选）</Label>
            <ActivityPicker
              value={field.state.value}
              onChange={(v) => field.handleChange(v)}
            />
            <p className="text-xs text-muted-foreground">
              选活动后这个任务会自动出现在活动任务池；不选即常驻任务。
            </p>
          </div>
        )}
      </form.Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : submitLabel}
      </Button>
    </form>
  )
}
