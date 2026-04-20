import { useState } from "react"

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
import { Textarea } from "#/components/ui/textarea"
import type {
  CreateRankSeasonInput,
  RankTierConfig,
} from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

interface Props {
  tierConfigs: RankTierConfig[]
  submitLabel: string
  isPending: boolean
  onSubmit: (values: CreateRankSeasonInput) => Promise<void> | void
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SeasonForm({
  tierConfigs,
  submitLabel,
  isPending,
  onSubmit,
}: Props) {
  const now = new Date()
  const monthFromNow = new Date(now.getTime() + 30 * 86400000)

  const [alias, setAlias] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [tierConfigId, setTierConfigId] = useState(
    tierConfigs[0]?.id ?? "",
  )
  const [startAt, setStartAt] = useState(toDatetimeLocal(now.toISOString()))
  const [endAt, setEndAt] = useState(
    toDatetimeLocal(monthFromNow.toISOString()),
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      alias,
      name,
      description: description || null,
      tierConfigId,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-alias">{m.rank_season_alias()}</Label>
          <Input
            id="s-alias"
            required
            pattern="[a-z0-9][a-z0-9\-_]*"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="s1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-name">{m.rank_season_name()}</Label>
          <Input
            id="s-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="s-description">{m.rank_season_description()}</Label>
        <Textarea
          id="s-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{m.rank_season_tier_config()}</Label>
        <Select value={tierConfigId} onValueChange={setTierConfigId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tierConfigs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}{" "}
                <span className="text-muted-foreground">({c.alias})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-start">{m.rank_season_start_at()}</Label>
          <Input
            id="s-start"
            type="datetime-local"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-end">{m.rank_season_end_at()}</Label>
          <Input
            id="s-end"
            type="datetime-local"
            required
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={isPending || !tierConfigId}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
