/**
 * Visual editor for a CmsSchemaDef.
 *
 * Lets the operator add, edit, reorder, and delete `CmsFieldDef` rows
 * inline. Each row exposes the universal field properties (name / label /
 * type / required / description) plus type-specific options (enum entries
 * for select; min/max length for text; etc.) under a collapsible advanced
 * section.
 *
 * Constraints enforced here so the server never has to second-guess:
 *   - field names match `[A-Za-z_][A-Za-z0-9_]*`
 *   - select / multiselect must have at least one enum option
 *   - array must have an itemDef (we auto-seed `{ name: "item", type: "text" }`)
 *   - object must have at least one nested field
 *
 * Out of scope for v1: drag-to-reorder (using up/down buttons instead),
 * nested array<object<array>> editing beyond two levels (renders the
 * deeper itemDef in compact form).
 */

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "#/components/ui/badge"
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
import { CMS_FIELD_TYPES, type CmsFieldDef, type CmsSchemaDef } from "#/lib/types/cms"

interface SchemaBuilderProps {
  value: CmsSchemaDef
  onChange: (next: CmsSchemaDef) => void
  /** When true, schema is being edited on an existing type — warn about additive-only. */
  evolutionMode?: boolean
}

const DEFAULT_FIELD: CmsFieldDef = {
  name: "field_1",
  label: "Field 1",
  type: "text",
  required: false,
}

export function SchemaBuilder({
  value,
  onChange,
  evolutionMode,
}: SchemaBuilderProps) {
  const fields = value.fields

  function setFields(next: CmsFieldDef[]) {
    onChange({ ...value, fields: next })
  }

  function addField() {
    const idx = fields.length + 1
    let name = `field_${idx}`
    while (fields.some((f) => f.name === name)) {
      name = `${name}_${Math.floor(Math.random() * 1000)}`
    }
    setFields([
      ...fields,
      { ...DEFAULT_FIELD, name, label: name },
    ])
  }

  function updateField(i: number, patch: Partial<CmsFieldDef>) {
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  function removeField(i: number) {
    setFields(fields.filter((_, idx) => idx !== i))
  }

  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const next = [...fields]
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    setFields(next)
  }

  return (
    <div className="space-y-3">
      {evolutionMode ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {m.cms_schema_evolution_warning()}
        </p>
      ) : null}

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {m.cms_schema_empty_hint()}
        </div>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <FieldRow
              key={i}
              field={f}
              onChange={(patch) => updateField(i, patch)}
              onRemove={() => removeField(i)}
              onMoveUp={i > 0 ? () => moveField(i, -1) : undefined}
              onMoveDown={
                i < fields.length - 1 ? () => moveField(i, 1) : undefined
              }
            />
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addField}>
        <Plus className="size-4" />
        {m.cms_schema_add_field()}
      </Button>
    </div>
  )
}

interface FieldRowProps {
  field: CmsFieldDef
  onChange: (patch: Partial<CmsFieldDef>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FieldRowProps) {
  const [open, setOpen] = useState(false)

  function handleTypeChange(nextType: CmsFieldDef["type"]) {
    const patch: Partial<CmsFieldDef> = { type: nextType }
    // Seed type-specific structure when needed
    if (nextType === "select" || nextType === "multiselect") {
      if (!field.validation?.enum?.length) {
        patch.validation = {
          ...field.validation,
          enum: [{ value: "option_1", label: "Option 1" }],
        }
      }
    }
    if (nextType === "array" && !field.itemDef) {
      patch.itemDef = { name: "item", label: "Item", type: "text" }
    }
    if (nextType === "object" && !field.fields?.length) {
      patch.fields = [{ name: "child", label: "Child", type: "text" }]
    }
    onChange(patch)
  }

  return (
    <li className="rounded-md border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px] space-y-1">
          <Label className="text-xs">{m.cms_field_name()}</Label>
          <Input
            value={field.name}
            onChange={(e) =>
              onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })
            }
            placeholder="my_field"
          />
        </div>
        <div className="flex-1 min-w-[160px] space-y-1">
          <Label className="text-xs">{m.cms_field_label()}</Label>
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div className="w-[160px] space-y-1">
          <Label className="text-xs">{m.cms_field_type()}</Label>
          <Select
            value={field.type}
            onValueChange={(v) =>
              handleTypeChange(v as CmsFieldDef["type"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CMS_FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label
            htmlFor={`req-${field.name}`}
            className="cursor-pointer text-xs"
          >
            {m.cms_field_required()}
          </Label>
          <Switch
            id={`req-${field.name}`}
            checked={!!field.required}
            onCheckedChange={(c) => onChange({ required: c })}
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {onMoveUp ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              aria-label={m.cms_field_move_up()}
            >
              <ChevronUp className="size-4" />
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              aria-label={m.cms_field_move_down()}
            >
              <ChevronDown className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={m.common_delete()}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((x) => !x)}
          >
            {open ? m.cms_field_hide_advanced() : m.cms_field_show_advanced()}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">{m.cms_field_description()}</Label>
            <Textarea
              rows={2}
              value={field.description ?? ""}
              onChange={(e) =>
                onChange({ description: e.target.value || undefined })
              }
            />
          </div>

          {(field.type === "text" ||
            field.type === "textarea" ||
            field.type === "markdown") && (
            <>
              <NumberInput
                label={m.cms_field_min_length()}
                value={field.validation?.minLength}
                onChange={(v) =>
                  onChange({
                    validation: { ...field.validation, minLength: v },
                  })
                }
              />
              <NumberInput
                label={m.cms_field_max_length()}
                value={field.validation?.maxLength}
                onChange={(v) =>
                  onChange({
                    validation: { ...field.validation, maxLength: v },
                  })
                }
              />
            </>
          )}

          {field.type === "number" && (
            <>
              <NumberInput
                label={m.cms_field_min()}
                value={field.validation?.min}
                onChange={(v) =>
                  onChange({ validation: { ...field.validation, min: v } })
                }
              />
              <NumberInput
                label={m.cms_field_max()}
                value={field.validation?.max}
                onChange={(v) =>
                  onChange({ validation: { ...field.validation, max: v } })
                }
              />
            </>
          )}

          {(field.type === "select" || field.type === "multiselect") && (
            <div className="md:col-span-2">
              <EnumOptionEditor
                options={field.validation?.enum ?? []}
                onChange={(next) =>
                  onChange({
                    validation: { ...field.validation, enum: next },
                  })
                }
              />
            </div>
          )}

          {field.type === "entryRef" && (
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">{m.cms_field_ref_type_alias()}</Label>
              <Input
                value={field.options?.refTypeAlias ?? ""}
                onChange={(e) =>
                  onChange({
                    options: {
                      ...field.options,
                      refTypeAlias: e.target.value || undefined,
                    },
                  })
                }
                placeholder="blog-post"
              />
            </div>
          )}

          {field.type === "array" && (
            <div className="md:col-span-2 space-y-2 rounded-md border p-2">
              <Badge variant="outline" className="text-xs">
                {m.cms_field_array_item()}
              </Badge>
              {field.itemDef ? (
                <FieldRow
                  field={field.itemDef}
                  onChange={(patch) =>
                    onChange({
                      itemDef: { ...field.itemDef!, ...patch },
                    })
                  }
                  onRemove={() => {
                    /* arrays always need an itemDef — replace with default */
                    onChange({
                      itemDef: { name: "item", label: "Item", type: "text" },
                    })
                  }}
                />
              ) : null}
            </div>
          )}

          {field.type === "object" && (
            <div className="md:col-span-2 space-y-2 rounded-md border p-2">
              <Badge variant="outline" className="text-xs">
                {m.cms_field_object_fields()}
              </Badge>
              <SchemaBuilder
                value={{ fields: field.fields ?? [] }}
                onChange={(next) => onChange({ fields: next.fields })}
              />
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          if (v === "") return onChange(undefined)
          const n = Number(v)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </div>
  )
}

function EnumOptionEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[]
  onChange: (next: { value: string; label: string }[]) => void
}) {
  function update(i: number, patch: Partial<{ value: string; label: string }>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  }
  function add() {
    const i = options.length + 1
    onChange([...options, { value: `option_${i}`, label: `Option ${i}` }])
  }
  function remove(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{m.cms_field_enum_options()}</Label>
      <ul className="space-y-1">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={o.value}
              placeholder="value"
              onChange={(e) =>
                update(i, {
                  value: e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""),
                })
              }
            />
            <Input
              value={o.label}
              placeholder="label"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(i)}
              aria-label={m.common_delete()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" />
        {m.cms_field_enum_add()}
      </Button>
    </div>
  )
}
