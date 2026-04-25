/**
 * Renders a form for entering data that conforms to a `CmsSchemaDef`.
 *
 * Each `CmsFieldDef` is dispatched to the matching primitive renderer
 * (text → Input, markdown → Textarea, select → Select, …). This is the
 * runtime counterpart to the SchemaBuilder: SchemaBuilder produces the
 * schema, DynamicForm consumes it.
 *
 * Why not a heavier framework like react-jsonschema-form? Our DSL has
 * `image / entryRef / refTypeAlias` concepts that JSON Schema can't
 * express natively, and shadcn/ui v4 styling is hard to graft onto
 * rjsf's renderer. Hand-rolled dispatcher is simpler and matches every
 * other admin form's look.
 *
 * v1 simplifications:
 *   - markdown / json fields render as plain Textarea (no editor lib).
 *     A future M5 can swap in @uiw/react-md-editor / CodeMirror without
 *     touching callers.
 *   - image picker reuses the existing MediaPickerDialog component.
 *   - entryRef shows two text inputs (typeAlias + alias). Picker dialog
 *     is a follow-up.
 */

import { Plus, Trash2 } from "lucide-react"

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
import * as m from "#/paraglide/messages.js"
import type { CmsFieldDef, CmsSchemaDef } from "#/lib/types/cms"

interface DynamicFormProps {
  schema: CmsSchemaDef
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

export function DynamicForm({ schema, value, onChange }: DynamicFormProps) {
  return (
    <div className="space-y-4">
      {schema.fields.map((f) => (
        <FieldRenderer
          key={f.name}
          def={f}
          value={value[f.name]}
          onChange={(v) => onChange({ ...value, [f.name]: v })}
        />
      ))}
    </div>
  )
}

interface FieldRendererProps {
  def: CmsFieldDef
  value: unknown
  onChange: (next: unknown) => void
}

function FieldRenderer({ def, value, onChange }: FieldRendererProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label className="text-sm font-medium">
          {def.label}
          {def.required ? (
            <span className="ml-0.5 text-destructive">*</span>
          ) : null}
        </Label>
        <Badge variant="outline" className="text-[10px] uppercase">
          {def.type}
        </Badge>
      </div>
      {def.description ? (
        <p className="text-xs text-muted-foreground">{def.description}</p>
      ) : null}

      <FieldInput def={def} value={value} onChange={onChange} />
    </div>
  )
}

function FieldInput({ def, value, onChange }: FieldRendererProps) {
  switch (def.type) {
    case "text":
      return (
        <Input
          value={(value as string | undefined) ?? ""}
          placeholder={def.options?.placeholder}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
    case "textarea":
    case "markdown":
      return (
        <Textarea
          rows={def.options?.rows ?? (def.type === "markdown" ? 10 : 4)}
          value={(value as string | undefined) ?? ""}
          placeholder={def.options?.placeholder}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
    case "number":
      return (
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => {
            const v = e.target.value
            if (v === "") return onChange(null)
            const n = Number(v)
            onChange(Number.isFinite(n) ? n : null)
          }}
        />
      )
    case "boolean":
      return (
        <Switch
          checked={!!value}
          onCheckedChange={(c) => onChange(c)}
        />
      )
    case "date":
      return (
        <Input
          type="date"
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
    case "datetime":
      return (
        <Input
          type="datetime-local"
          value={toLocalInput((value as string | undefined) ?? null)}
          onChange={(e) => onChange(toIsoOrNull(e.target.value))}
        />
      )
    case "select":
      return (
        <Select
          value={(value as string | undefined) ?? ""}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder={def.options?.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(def.validation?.enum ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="grid grid-cols-2 gap-2">
          {(def.validation?.enum ?? []).map((o) => {
            const checked = arr.includes(o.value)
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    if (c) onChange([...arr, o.value])
                    else onChange(arr.filter((x) => x !== o.value))
                  }}
                />
                {o.label}
              </label>
            )
          })}
        </div>
      )
    }
    case "image": {
      const obj =
        (value && typeof value === "object" && !Array.isArray(value)
          ? (value as { mediaId?: string; alt?: string })
          : null) ?? null
      return (
        <div className="space-y-2">
          <MediaPickerDialog
            value={obj?.mediaId ?? null}
            onChange={(mediaId) =>
              onChange(mediaId ? { mediaId, alt: obj?.alt } : null)
            }
          />
          <Input
            placeholder={m.cms_field_image_alt_placeholder()}
            value={obj?.alt ?? ""}
            onChange={(e) =>
              onChange({ ...(obj ?? {}), alt: e.target.value || undefined })
            }
            disabled={!obj?.mediaId}
          />
        </div>
      )
    }
    case "entryRef": {
      const obj =
        (value && typeof value === "object" && !Array.isArray(value)
          ? (value as { typeAlias?: string; alias?: string })
          : null) ?? null
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder={def.options?.refTypeAlias ?? "type-alias"}
            value={obj?.typeAlias ?? def.options?.refTypeAlias ?? ""}
            onChange={(e) =>
              onChange({ ...(obj ?? {}), typeAlias: e.target.value })
            }
            readOnly={!!def.options?.refTypeAlias}
          />
          <Input
            placeholder="entry-alias"
            value={obj?.alias ?? ""}
            onChange={(e) =>
              onChange({ ...(obj ?? {}), alias: e.target.value })
            }
          />
        </div>
      )
    }
    case "array": {
      const arr = Array.isArray(value) ? (value as unknown[]) : []
      const itemDef = def.itemDef
      if (!itemDef) return null
      return (
        <div className="space-y-2">
          {arr.map((item, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-md border bg-card p-2"
            >
              <div className="flex-1">
                <FieldInput
                  def={itemDef}
                  value={item}
                  onChange={(v) => {
                    const next = [...arr]
                    next[i] = v
                    onChange(next)
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(arr.filter((_, idx) => idx !== i))}
                aria-label={m.common_delete()}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...arr, defaultForType(itemDef)])}
          >
            <Plus className="size-4" />
            {m.cms_field_array_add()}
          </Button>
        </div>
      )
    }
    case "object": {
      const obj =
        (value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null) ?? {}
      return (
        <div className="rounded-md border bg-muted/30 p-3">
          <DynamicForm
            schema={{ fields: def.fields ?? [] }}
            value={obj}
            onChange={onChange}
          />
        </div>
      )
    }
    case "json":
      return (
        <Textarea
          rows={6}
          className="font-mono text-xs"
          value={typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)}
          onChange={(e) => {
            const text = e.target.value
            try {
              onChange(JSON.parse(text))
            } catch {
              onChange(text)
            }
          }}
        />
      )
  }
}

function defaultForType(def: CmsFieldDef): unknown {
  switch (def.type) {
    case "boolean":
      return false
    case "number":
      return 0
    case "array":
      return []
    case "object":
      return {}
    case "multiselect":
      return []
    default:
      return null
  }
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
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
