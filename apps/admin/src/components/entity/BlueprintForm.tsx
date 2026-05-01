import { useForm } from "@tanstack/react-form"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type { CreateBlueprintInput, EntitySchema } from "#/lib/types/entity"

interface BlueprintFormProps {
  schema: EntitySchema
  defaultValues?: Partial<CreateBlueprintInput>
  onSubmit: (values: CreateBlueprintInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function BlueprintForm({
  schema,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: BlueprintFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      rarity: defaultValues?.rarity ?? "",
      tags: defaultValues?.tags ?? {} as Record<string, string>,
      baseStats: defaultValues?.baseStats ?? {} as Record<string, number>,
      statGrowth: defaultValues?.statGrowth ?? {} as Record<string, number>,
      maxLevel: defaultValues?.maxLevel ?? null as number | null,
      isActive: defaultValues?.isActive ?? true,
      activityId: defaultValues?.activityId ?? (null as string | null),
    },
    onSubmit: async ({ value }) => {
      const input: CreateBlueprintInput = {
        schemaId: schema.id,
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        icon: value.icon || null,
        rarity: value.rarity || null,
        tags: value.tags,
        baseStats: value.baseStats,
        statGrowth: value.statGrowth,
        maxLevel: value.maxLevel,
        isActive: value.isActive,
        activityId: value.activityId,
      }
      await onSubmit(input)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {/* Basic Fields */}
      <div className="grid grid-cols-2 gap-4">
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (!value ? m.common_required() : undefined),
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
                placeholder="Fire Dragon Warrior"
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
                placeholder="fire-warrior"
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="rarity">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>{m.entity_rarity()}</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="SSR"
              />
            </div>
          )}
        </form.Field>

        {schema.levelConfig.enabled && (
          <form.Field name="maxLevel">
            {(field) => (
              <div className="space-y-2">
                <Label>
                  {m.entity_max_level()} ({m.common_optional()}, {m.entity_default_value()}: {schema.levelConfig.maxLevel})
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={field.state.value ?? ""}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </div>
            )}
          </form.Field>
        )}
      </div>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_description()}</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={2}
            />
          </div>
        )}
      </form.Field>

      {/* Tags — dynamic from schema.tagDefinitions */}
      {schema.tagDefinitions.length > 0 && (
        <div className="space-y-3">
          <Label>{m.entity_tags()}</Label>
          <form.Field name="tags">
            {(field) => (
              <div className="grid grid-cols-2 gap-3">
                {schema.tagDefinitions.map((td) => (
                  <div key={td.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {td.label} ({td.key})
                    </Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={(field.state.value as Record<string, string>)[td.key] ?? ""}
                      onChange={(e) => {
                        const next = { ...(field.state.value as Record<string, string>) }
                        if (e.target.value) {
                          next[td.key] = e.target.value
                        } else {
                          delete next[td.key]
                        }
                        field.handleChange(next)
                      }}
                    >
                      <option value="">—</option>
                      {td.values.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </form.Field>
        </div>
      )}

      {/* Base Stats — dynamic from schema.statDefinitions */}
      {schema.statDefinitions.length > 0 && (
        <div className="space-y-3">
          <Label>{m.entity_base_stats()}</Label>
          <form.Field name="baseStats">
            {(field) => (
              <div className="grid grid-cols-3 gap-3">
                {schema.statDefinitions.map((sd) => (
                  <div key={sd.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {sd.label} ({sd.key})
                    </Label>
                    <Input
                      type="number"
                      step={sd.type === "decimal" ? 0.01 : 1}
                      value={(field.state.value as Record<string, number>)[sd.key] ?? sd.defaultValue}
                      onChange={(e) => {
                        const next = { ...(field.state.value as Record<string, number>) }
                        next[sd.key] = Number(e.target.value)
                        field.handleChange(next)
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </form.Field>
        </div>
      )}

      {/* Stat Growth */}
      {schema.statDefinitions.length > 0 && schema.levelConfig.enabled && (
        <div className="space-y-3">
          <Label>{m.entity_stat_growth()}</Label>
          <form.Field name="statGrowth">
            {(field) => (
              <div className="grid grid-cols-3 gap-3">
                {schema.statDefinitions.map((sd) => (
                  <div key={sd.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {sd.label}/Lv
                    </Label>
                    <Input
                      type="number"
                      step={sd.type === "decimal" ? 0.001 : 1}
                      value={(field.state.value as Record<string, number>)[sd.key] ?? 0}
                      onChange={(e) => {
                        const next = { ...(field.state.value as Record<string, number>) }
                        next[sd.key] = Number(e.target.value)
                        field.handleChange(next)
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </form.Field>
        </div>
      )}

      {/* Active + Sort Order */}
      <div className="grid grid-cols-2 gap-4">
        <form.Field name="isActive">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <Label>{m.common_active()}</Label>
            </div>
          )}
        </form.Field>
      </div>

      {/* Submit */}
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
