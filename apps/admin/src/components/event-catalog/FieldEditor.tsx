import { Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type {
  EventFieldRow,
  EventFieldType,
} from "#/lib/types/event-catalog"
import * as m from "#/paraglide/messages.js"

const TYPES: EventFieldType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
  "unknown",
]

interface FieldEditorProps {
  value: EventFieldRow[]
  onChange: (next: EventFieldRow[]) => void
  disabled?: boolean
}

export function FieldEditor({ value, onChange, disabled }: FieldEditorProps) {
  function patch(idx: number, update: Partial<EventFieldRow>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...update } : row)))
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }
  function add() {
    onChange([...value, { path: "", type: "string", required: false }])
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,2fr)_140px_80px_minmax(0,3fr)_40px] items-center gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
        <div>{m.event_catalog_field_path()}</div>
        <div>{m.event_catalog_field_type()}</div>
        <div>{m.event_catalog_field_required()}</div>
        <div>{m.event_catalog_field_description()}</div>
        <div />
      </div>
      {value.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          {m.event_catalog_fields_empty()}
        </div>
      ) : (
        value.map((row, idx) => (
          <div
            key={`${idx}-${row.path}`}
            className="grid grid-cols-[minmax(0,2fr)_140px_80px_minmax(0,3fr)_40px] items-center gap-2"
          >
            <Input
              value={row.path}
              onChange={(e) => patch(idx, { path: e.target.value })}
              placeholder="stats.level"
              disabled={disabled}
              className="font-mono"
            />
            <Select
              value={row.type}
              onValueChange={(v) =>
                patch(idx, { type: v as EventFieldType })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-center">
              <Checkbox
                checked={row.required}
                onCheckedChange={(c) =>
                  patch(idx, { required: c === true })
                }
                disabled={disabled}
              />
            </div>
            <Input
              value={row.description ?? ""}
              onChange={(e) =>
                patch(idx, { description: e.target.value || undefined })
              }
              placeholder={m.event_catalog_field_description_placeholder()}
              disabled={disabled}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => remove(idx)}
              disabled={disabled}
              aria-label={m.event_catalog_remove_field()}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))
      )}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={add}
          disabled={disabled}
        >
          {m.event_catalog_add_field()}
        </Button>
      </div>
    </div>
  )
}
