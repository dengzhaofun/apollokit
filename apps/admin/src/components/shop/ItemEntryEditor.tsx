import { Plus, Trash2 } from "lucide-react"

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
import * as m from "#/paraglide/messages.js"
import type { ItemEntry } from "#/lib/types/item"

interface DefinitionOption {
  id: string
  name: string
}

interface ItemEntryEditorProps {
  label: string
  entries: ItemEntry[]
  onChange: (entries: ItemEntry[]) => void
  definitions: DefinitionOption[]
  hint?: string
}

export function ItemEntryEditor({
  label,
  entries,
  onChange,
  definitions,
  hint,
}: ItemEntryEditorProps) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {m.item_add_valid_item()}
        </p>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                value={entry.definitionId}
                onValueChange={(v) => {
                  const next = [...entries]
                  next[i] = { ...entry, definitionId: v }
                  onChange(next)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.mail_field_select_item()} />
                </SelectTrigger>
                <SelectContent>
                  {definitions.map((def) => (
                    <SelectItem key={def.id} value={def.id}>
                      {def.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Input
                type="number"
                min={1}
                value={entry.quantity}
                onChange={(e) => {
                  const next = [...entries]
                  next[i] = { ...entry, quantity: Number(e.target.value) || 1 }
                  onChange(next)
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => {
                const next = entries.filter((_, j) => j !== i)
                onChange(next)
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entries, { definitionId: "", quantity: 1 }])}
      >
        <Plus className="size-4" />
        {m.item_add_item()}
      </Button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
