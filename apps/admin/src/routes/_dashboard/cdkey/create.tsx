import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import { useCreateCdkeyBatch } from "#/hooks/use-cdkey"
import { useItemDefinitions } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import type { CdkeyCodeType, CreateBatchInput } from "#/lib/types/cdkey"
import type { ItemEntry } from "#/lib/types/item"

export const Route = createFileRoute("/_dashboard/cdkey/create")({
  component: CdkeyCreatePage,
})

function CdkeyCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateCdkeyBatch()
  const { data: defs } = useItemDefinitions()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [codeType, setCodeType] = useState<CdkeyCodeType>("universal")
  const [universalCode, setUniversalCode] = useState("")
  const [initialCount, setInitialCount] = useState(100)
  const [totalLimit, setTotalLimit] = useState<string>("")
  const [perUserLimit, setPerUserLimit] = useState(1)
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [reward, setReward] = useState<ItemEntry[]>([])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (reward.length === 0) {
      toast.error(m.cdkey_failed_create())
      return
    }
    const input: CreateBatchInput = {
      name,
      alias: alias.trim() || null,
      description: description.trim() || null,
      codeType,
      reward,
      perUserLimit,
      isActive,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    }
    if (codeType === "universal") {
      input.totalLimit = totalLimit ? Number(totalLimit) : null
      if (universalCode.trim()) input.universalCode = universalCode.trim()
    } else {
      input.initialCount = initialCount
    }

    try {
      const created = await mutation.mutateAsync(input)
      toast.success(m.cdkey_batch_created())
      navigate({ to: "/cdkey/$batchId", params: { batchId: created.id } })
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error(m.cdkey_failed_create())
      }
    }
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.cdkey_new_batch()}</h1>
      </header>

      <main className="flex-1 p-6">
        <form
          onSubmit={submit}
          className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label>{m.common_name()}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{m.common_alias()}</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{m.common_description()}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.cdkey_code_type()}</Label>
            <Select
              value={codeType}
              onValueChange={(v) => setCodeType(v as CdkeyCodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="universal">
                  {m.cdkey_code_type_universal()}
                </SelectItem>
                <SelectItem value="unique">
                  {m.cdkey_code_type_unique()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {codeType === "universal" ? (
            <>
              <div className="space-y-2">
                <Label>{m.cdkey_universal_code()}</Label>
                <Input
                  value={universalCode}
                  onChange={(e) => setUniversalCode(e.target.value)}
                  placeholder={m.cdkey_optional_universal_code()}
                />
              </div>
              <div className="space-y-2">
                <Label>{m.cdkey_total_limit()}</Label>
                <Input
                  type="number"
                  min={1}
                  value={totalLimit}
                  onChange={(e) => setTotalLimit(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>{m.cdkey_initial_count()}</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={initialCount}
                onChange={(e) =>
                  setInitialCount(Number(e.target.value) || 1)
                }
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{m.cdkey_per_user_limit()}</Label>
            <Input
              type="number"
              min={1}
              value={perUserLimit}
              onChange={(e) => setPerUserLimit(Number(e.target.value) || 1)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{m.cdkey_starts_at()}</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{m.cdkey_ends_at()}</Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>{m.common_active()}</Label>
          </div>

          <Separator />

          <RewardEditor
            value={reward}
            onChange={setReward}
            definitions={defs ?? []}
          />

          <Button type="submit" disabled={mutation.isPending}>
            {m.common_create()}
          </Button>
        </form>
      </main>
    </>
  )
}

function RewardEditor({
  value,
  onChange,
  definitions,
}: {
  value: ItemEntry[]
  onChange: (v: ItemEntry[]) => void
  definitions: { id: string; name: string }[]
}) {
  return (
    <div className="space-y-3">
      <Label>{m.cdkey_reward()}</Label>
      {value.map((entry, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              value={entry.definitionId}
              onValueChange={(v) => {
                const next = [...value]
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
          <div className="w-24">
            <Input
              type="number"
              min={1}
              value={entry.quantity}
              onChange={(e) => {
                const next = [...value]
                next[i] = {
                  ...entry,
                  quantity: Number(e.target.value) || 1,
                }
                onChange(next)
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...value, { definitionId: "", quantity: 1 }])
        }
      >
        <Plus className="size-4" />
        {m.common_add()}
      </Button>
    </div>
  )
}
