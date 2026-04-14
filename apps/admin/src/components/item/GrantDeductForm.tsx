import { useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import * as m from "#/paraglide/messages.js"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useItemDefinitions, useGrantItems, useDeductItems } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import type { ItemEntry } from "#/lib/types/item"

interface EntryRow {
  definitionId: string
  quantity: number
}

function ItemEntryEditor({
  entries,
  onChange,
  definitions,
}: {
  entries: EntryRow[]
  onChange: (entries: EntryRow[]) => void
  definitions: { id: string; name: string }[]
}) {
  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            {i === 0 && <Label className="text-xs">Item</Label>}
            <Select
              value={entry.definitionId}
              onValueChange={(v) => {
                const next = [...entries]
                next[i] = { ...entry, definitionId: v }
                onChange(next)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select item..." />
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
          <div className="w-28 space-y-1">
            {i === 0 && <Label className="text-xs">{m.item_qty()}</Label>}
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
              onChange(next.length > 0 ? next : [{ definitionId: "", quantity: 1 }])
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entries, { definitionId: "", quantity: 1 }])}
      >
        <Plus className="size-4" />
        {m.item_add_item()}
      </Button>
    </div>
  )
}

export function GrantDeductForm() {
  const { data: definitions } = useItemDefinitions()
  const grantMutation = useGrantItems()
  const deductMutation = useDeductItems()

  const [endUserId, setEndUserId] = useState("")
  const [source, setSource] = useState("admin_grant")
  const [sourceId, setSourceId] = useState("")
  const [grantEntries, setGrantEntries] = useState<EntryRow[]>([
    { definitionId: "", quantity: 1 },
  ])
  const [deductEntries, setDeductEntries] = useState<EntryRow[]>([
    { definitionId: "", quantity: 1 },
  ])

  const defs = (definitions ?? []).map((d) => ({ id: d.id, name: d.name }))

  function validateEntries(entries: EntryRow[]): ItemEntry[] | null {
    const valid = entries.filter((e) => e.definitionId && e.quantity > 0)
    if (valid.length === 0) {
      toast.error(m.item_add_valid_item())
      return null
    }
    return valid
  }

  async function handleGrant() {
    if (!endUserId.trim()) {
      toast.error(m.item_end_user_id_required())
      return
    }
    const grants = validateEntries(grantEntries)
    if (!grants) return
    try {
      const result = await grantMutation.mutateAsync({
        endUserId: endUserId.trim(),
        grants,
        source,
        sourceId: sourceId || undefined,
      })
      toast.success(
        `Granted ${result.grants.length} item(s) successfully`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.error : m.item_failed_grant())
    }
  }

  async function handleDeduct() {
    if (!endUserId.trim()) {
      toast.error(m.item_end_user_id_required())
      return
    }
    const deductions = validateEntries(deductEntries)
    if (!deductions) return
    try {
      const result = await deductMutation.mutateAsync({
        endUserId: endUserId.trim(),
        deductions,
        source,
        sourceId: sourceId || undefined,
      })
      toast.success(
        `Deducted ${result.deductions.length} item(s) successfully`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.error : m.item_failed_deduct())
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gd-endUserId">{m.item_end_user_id()} *</Label>
          <Input
            id="gd-endUserId"
            value={endUserId}
            onChange={(e) => setEndUserId(e.target.value)}
            placeholder="e.g. user-42"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gd-source">{m.item_source()} *</Label>
          <Input
            id="gd-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. admin_grant"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gd-sourceId">{m.item_source_id()}</Label>
        <Input
          id="gd-sourceId"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder={m.item_source_id_placeholder()}
        />
      </div>

      <Tabs defaultValue="grant">
        <TabsList>
          <TabsTrigger value="grant">{m.item_grant()}</TabsTrigger>
          <TabsTrigger value="deduct">{m.item_deduct()}</TabsTrigger>
        </TabsList>
        <TabsContent value="grant" className="space-y-4 pt-4">
          <ItemEntryEditor
            entries={grantEntries}
            onChange={setGrantEntries}
            definitions={defs}
          />
          <Button
            onClick={handleGrant}
            disabled={grantMutation.isPending}
          >
            {grantMutation.isPending ? m.item_granting() : m.item_grant_items()}
          </Button>
        </TabsContent>
        <TabsContent value="deduct" className="space-y-4 pt-4">
          <ItemEntryEditor
            entries={deductEntries}
            onChange={setDeductEntries}
            definitions={defs}
          />
          <Button
            variant="destructive"
            onClick={handleDeduct}
            disabled={deductMutation.isPending}
          >
            {deductMutation.isPending ? m.item_deducting() : m.item_deduct_items()}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
