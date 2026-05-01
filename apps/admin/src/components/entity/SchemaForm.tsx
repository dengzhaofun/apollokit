import { useForm } from "@tanstack/react-form"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type { CreateSchemaInput, StatDefinition, TagDefinition } from "#/lib/types/entity"

interface SchemaFormProps {
  defaultValues?: Partial<CreateSchemaInput>
  onSubmit: (values: CreateSchemaInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function SchemaForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: SchemaFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      statDefinitions: defaultValues?.statDefinitions ?? [],
      tagDefinitions: defaultValues?.tagDefinitions ?? [],
      slotDefinitions: defaultValues?.slotDefinitions ?? [],
      levelEnabled: defaultValues?.levelConfig?.enabled ?? false,
      levelMaxLevel: defaultValues?.levelConfig?.maxLevel ?? 60,
      rankEnabled: defaultValues?.rankConfig?.enabled ?? false,
      ranks: defaultValues?.rankConfig?.ranks ?? [],
      synthesisEnabled: defaultValues?.synthesisConfig?.enabled ?? false,
      sameBlueprint: defaultValues?.synthesisConfig?.sameBlueprint ?? true,
      inputCount: defaultValues?.synthesisConfig?.inputCount ?? 3,
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreateSchemaInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        icon: value.icon || null,
        statDefinitions: value.statDefinitions,
        tagDefinitions: value.tagDefinitions,
        slotDefinitions: value.slotDefinitions,
        levelConfig: { enabled: value.levelEnabled, maxLevel: value.levelMaxLevel },
        rankConfig: { enabled: value.rankEnabled, ranks: value.ranks },
        synthesisConfig: {
          enabled: value.synthesisEnabled,
          sameBlueprint: value.sameBlueprint,
          inputCount: value.inputCount,
        },
        isActive: value.isActive,
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
                placeholder="Hero"
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
                placeholder="hero"
              />
            </div>
          )}
        </form.Field>
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

      {/* Stat Definitions */}
      <div className="space-y-3">
        <Label>{m.entity_stat_definitions()}</Label>
        <form.Field name="statDefinitions">
          {(field) => (
            <div className="space-y-2">
              {(field.state.value as StatDefinition[]).map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="w-24"
                    placeholder={m.entity_key()}
                    value={stat.key}
                    onChange={(e) => {
                      const next = [...(field.state.value as StatDefinition[])]
                      next[i] = { ...next[i]!, key: e.target.value }
                      field.handleChange(next)
                    }}
                  />
                  <Input
                    className="w-28"
                    placeholder={m.entity_label()}
                    value={stat.label}
                    onChange={(e) => {
                      const next = [...(field.state.value as StatDefinition[])]
                      next[i] = { ...next[i]!, label: e.target.value }
                      field.handleChange(next)
                    }}
                  />
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={stat.type}
                    onChange={(e) => {
                      const next = [...(field.state.value as StatDefinition[])]
                      next[i] = { ...next[i]!, type: e.target.value as "integer" | "decimal" }
                      field.handleChange(next)
                    }}
                  >
                    <option value="integer">integer</option>
                    <option value="decimal">decimal</option>
                  </select>
                  <Input
                    className="w-20"
                    type="number"
                    placeholder="0"
                    value={stat.defaultValue}
                    onChange={(e) => {
                      const next = [...(field.state.value as StatDefinition[])]
                      next[i] = { ...next[i]!, defaultValue: Number(e.target.value) }
                      field.handleChange(next)
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = (field.state.value as StatDefinition[]).filter((_, j) => j !== i)
                      field.handleChange(next)
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  field.handleChange([
                    ...(field.state.value as StatDefinition[]),
                    { key: "", label: "", type: "integer" as const, defaultValue: 0 },
                  ])
                }}
              >
                {m.entity_add_stat()}
              </Button>
            </div>
          )}
        </form.Field>
      </div>

      {/* Tag Definitions */}
      <div className="space-y-3">
        <Label>{m.entity_tag_definitions()}</Label>
        <form.Field name="tagDefinitions">
          {(field) => (
            <div className="space-y-2">
              {(field.state.value as TagDefinition[]).map((tag, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="w-24"
                    placeholder={m.entity_key()}
                    value={tag.key}
                    onChange={(e) => {
                      const next = [...(field.state.value as TagDefinition[])]
                      next[i] = { ...next[i]!, key: e.target.value }
                      field.handleChange(next)
                    }}
                  />
                  <Input
                    className="w-28"
                    placeholder={m.entity_label()}
                    value={tag.label}
                    onChange={(e) => {
                      const next = [...(field.state.value as TagDefinition[])]
                      next[i] = { ...next[i]!, label: e.target.value }
                      field.handleChange(next)
                    }}
                  />
                  <Input
                    className="flex-1"
                    placeholder={`${m.entity_values()} (comma-separated)`}
                    value={tag.values.join(", ")}
                    onChange={(e) => {
                      const next = [...(field.state.value as TagDefinition[])]
                      next[i] = {
                        ...next[i]!,
                        values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                      }
                      field.handleChange(next)
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = (field.state.value as TagDefinition[]).filter((_, j) => j !== i)
                      field.handleChange(next)
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  field.handleChange([
                    ...(field.state.value as TagDefinition[]),
                    { key: "", label: "", values: [] },
                  ])
                }}
              >
                {m.entity_add_tag()}
              </Button>
            </div>
          )}
        </form.Field>
      </div>

      {/* Level Config */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>{m.entity_level_config()}</Label>
          <form.Field name="levelEnabled">
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s) => s.values.levelEnabled}>
          {(enabled) =>
            enabled ? (
              <form.Field name="levelMaxLevel">
                {(field) => (
                  <div className="space-y-2">
                    <Label>{m.entity_max_level()}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </div>

      {/* Rank Config */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>{m.entity_rank_config()}</Label>
          <form.Field name="rankEnabled">
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s) => s.values.rankEnabled}>
          {(enabled) =>
            enabled ? (
              <form.Field name="ranks">
                {(field) => (
                  <div className="space-y-2">
                    {(field.state.value as Array<{ key: string; label: string; order: number }>).map((rank, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          className="w-20"
                          placeholder={m.entity_key()}
                          value={rank.key}
                          onChange={(e) => {
                            const next = [...(field.state.value as Array<{ key: string; label: string; order: number }>)]
                            next[i] = { ...next[i]!, key: e.target.value }
                            field.handleChange(next)
                          }}
                        />
                        <Input
                          className="w-28"
                          placeholder={m.entity_label()}
                          value={rank.label}
                          onChange={(e) => {
                            const next = [...(field.state.value as Array<{ key: string; label: string; order: number }>)]
                            next[i] = { ...next[i]!, label: e.target.value }
                            field.handleChange(next)
                          }}
                        />
                        <Input
                          className="w-16"
                          type="number"
                          value={rank.order}
                          onChange={(e) => {
                            const next = [...(field.state.value as Array<{ key: string; label: string; order: number }>)]
                            next[i] = { ...next[i]!, order: Number(e.target.value) }
                            field.handleChange(next)
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = (field.state.value as Array<{ key: string; label: string; order: number }>).filter((_, j) => j !== i)
                            field.handleChange(next)
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const ranks = field.state.value as Array<{ key: string; label: string; order: number }>
                        field.handleChange([
                          ...ranks,
                          { key: "", label: "", order: ranks.length },
                        ])
                      }}
                    >
                      {m.entity_add_rank()}
                    </Button>
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </div>

      {/* Synthesis Config */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>{m.entity_synthesis_config()}</Label>
          <form.Field name="synthesisEnabled">
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s) => s.values.synthesisEnabled}>
          {(enabled) =>
            enabled ? (
              <div className="grid grid-cols-2 gap-4">
                <form.Field name="sameBlueprint">
                  {(field) => (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.state.value}
                        onCheckedChange={field.handleChange}
                      />
                      <Label>{m.entity_same_blueprint_required()}</Label>
                    </div>
                  )}
                </form.Field>
                <form.Field name="inputCount">
                  {(field) => (
                    <div className="space-y-2">
                      <Label>{m.entity_input_count()}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(Number(e.target.value))}
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            ) : null
          }
        </form.Subscribe>
      </div>

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
