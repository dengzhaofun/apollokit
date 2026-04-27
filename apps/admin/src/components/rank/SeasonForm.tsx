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
import type { RankTierConfig } from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

import type { SeasonFormApi } from "./use-season-form"

interface Props {
  /** Form instance owned by the caller — see `use-season-form.ts`. */
  form: SeasonFormApi
  tierConfigs: RankTierConfig[]
  submitLabel: string
  isPending: boolean
}

export function SeasonForm({ form, tierConfigs, submitLabel, isPending }: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="alias">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="s-alias">{m.rank_season_alias()}</Label>
              <Input
                id="s-alias"
                required
                pattern="[a-z0-9][a-z0-9\-_]*"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="s1"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="s-name">{m.rank_season_name()}</Label>
              <Input
                id="s-name"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="s-description">{m.rank_season_description()}</Label>
            <Textarea
              id="s-description"
              rows={2}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="tierConfigId">
        {(field) => (
          <div className="space-y-1.5">
            <Label>{m.rank_season_tier_config()}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v)}
            >
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
        )}
      </form.Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="startAt">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="s-start">{m.rank_season_start_at()}</Label>
              <Input
                id="s-start"
                type="datetime-local"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="endAt">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="s-end">{m.rank_season_end_at()}</Label>
              <Input
                id="s-end"
                type="datetime-local"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <form.Subscribe selector={(s) => s.values.tierConfigId}>
          {(tierConfigId) => (
            <Button type="submit" disabled={isPending || !tierConfigId}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
