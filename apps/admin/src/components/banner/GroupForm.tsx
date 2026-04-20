import { useState } from "react"

import { ActivityPicker } from "#/components/activity/ActivityPicker"
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
import type {
  BannerGroup,
  BannerLayout,
  CreateBannerGroupInput,
} from "#/lib/types/banner"

interface GroupFormProps {
  initial?: BannerGroup
  onSubmit: (values: CreateBannerGroupInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

export function GroupForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: GroupFormProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [layout, setLayout] = useState<BannerLayout>(
    (initial?.layout as BannerLayout) ?? "carousel",
  )
  const [intervalMs, setIntervalMs] = useState<number>(
    initial?.intervalMs ?? 4000,
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)
  const [activityId, setActivityId] = useState<string | null>(
    initial?.activityId ?? null,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      alias: alias.trim() ? alias.trim() : null,
      name: name.trim(),
      description: description.trim() ? description : null,
      layout,
      intervalMs,
      isActive,
      activityId,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="alias">{m.banner_field_alias()}</Label>
        <Input
          id="alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="home-main"
        />
        <p className="text-xs text-muted-foreground">
          {m.banner_field_alias_hint()}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">{m.banner_field_name()}</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">{m.banner_field_description()}</Label>
        <Textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{m.banner_field_layout()}</Label>
          <Select
            value={layout}
            onValueChange={(v) => setLayout(v as BannerLayout)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carousel">{m.banner_layout_carousel()}</SelectItem>
              <SelectItem value="single">{m.banner_layout_single()}</SelectItem>
              <SelectItem value="grid">{m.banner_layout_grid()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="interval">{m.banner_field_interval()}</Label>
          <Input
            id="interval"
            type="number"
            min={500}
            max={60000}
            step={500}
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value) || 4000)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="active" className="cursor-pointer">
          {m.banner_field_active()}
        </Label>
        <Switch
          id="active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>

      <div className="space-y-1">
        <Label>{m.common_link_activity_optional()}</Label>
        <ActivityPicker value={activityId} onChange={setActivityId} />
        <p className="text-xs text-muted-foreground">
          {m.banner_field_activity_hint()}
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
