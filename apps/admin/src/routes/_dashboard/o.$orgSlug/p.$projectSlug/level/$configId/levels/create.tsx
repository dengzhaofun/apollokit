import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import {
  RewardScheduleSection,
  type RewardScheduleKeyFieldsProps,
  type RewardTrack,
} from "#/components/rewards/RewardScheduleSection"
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
import { useCreateLevel, useLevelConfig, useLevelStages } from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { RewardEntry } from "#/lib/types/level"
import { PageHeader } from "#/components/patterns"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/level/$configId/levels/create",
)({
  component: LevelCreatePage,
})

type StarTierDraft = {
  id: string
  stars: number
  rewards: RewardEntry[]
}

function StarKeyFields({
  draft,
  onChange,
}: RewardScheduleKeyFieldsProps<StarTierDraft>) {
  return (
    <div className="space-y-2">
      <Label htmlFor="star-tier-stars">{m.level_field_star_count()}</Label>
      <Input
        id="star-tier-stars"
        type="number"
        min={1}
        value={draft.stars}
        onChange={(e) =>
          onChange({ ...draft, stars: Number(e.target.value) || 1 })
        }
      />
    </div>
  )
}

function LevelCreatePage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const { data: config } = useLevelConfig(configId)
  const { data: stages = [] } = useLevelStages(configId)
  const createMutation = useCreateLevel()
  const { orgSlug, projectSlug } = useTenantParams()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [maxStars, setMaxStars] = useState(3)
  const [stageId, setStageId] = useState<string>("")
  const [unlockRule, setUnlockRule] = useState("")
  const [clearRewards, setClearRewards] = useState<RewardEntry[]>([])
  const [starTiers, setStarTiers] = useState<StarTierDraft[]>([])
  const [metadata, setMetadata] = useState("")
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)

  const starTracks = useMemo<RewardTrack<StarTierDraft>[]>(
    () => [
      {
        id: "main",
        label: m.reward_section_title(),
        getRewards: (d) => d.rewards,
        setRewards: (d, rewards) => ({ ...d, rewards }),
      },
    ],
    [],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const sortedTiers = [...starTiers].sort((a, b) => a.stars - b.stars)
      const row = await createMutation.mutateAsync({
        configId,
        input: {
          name,
          alias: alias || null,
          description: description || null,
          icon: icon || null,
          difficulty: difficulty || null,
          maxStars,
          stageId: stageId || null,
          unlockRule: unlockRule ? JSON.parse(unlockRule) : null,
          clearRewards: clearRewards.length > 0 ? clearRewards : null,
          starRewards:
            sortedTiers.length > 0
              ? sortedTiers.map(({ stars, rewards }) => ({ stars, rewards }))
              : null,
          metadata: metadata ? JSON.parse(metadata) : null,
          isActive,
        },
      })
      toast.success(m.level_level_created())
      navigate({
        to: "/o/$orgSlug/p/$projectSlug/level/$configId/levels/$levelId",
        params: { orgSlug, projectSlug, configId, levelId: row.id },
      })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.level_failed_create())
    }
  }

  return (
    <>
      <PageHeader
        title={m.level_new_level()}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/level/$configId" params={{ orgSlug, projectSlug, configId }}>
                <ArrowLeft className="size-4" />
              </Link>
            }
            variant="ghost" size="icon"
          />
        }
      />

      <main className="flex-1 p-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label>{m.level_field_name()}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{m.level_field_alias()}</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.level_field_description()}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.common_icon()}</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{m.level_field_difficulty()}</Label>
            <Input
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder={m.level_difficulty_placeholder()}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.level_field_max_stars()}</Label>
            <Input
              type="number"
              min={0}
              value={maxStars}
              onChange={(e) => setMaxStars(Number(e.target.value))}
            />
          </div>

          {config?.hasStages && stages.length > 0 && (
            <div className="space-y-2">
              <Label>{m.level_field_stage()}</Label>
              <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder={m.level_field_stage_none()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{m.level_field_stage_none()}</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{m.level_field_unlock_rule()}</Label>
            <Textarea
              value={unlockRule}
              onChange={(e) => setUnlockRule(e.target.value)}
              rows={4}
              placeholder='{"type":"auto"}'
            />
          </div>

          <RewardEntryEditor
            label={m.level_field_clear_rewards()}
            entries={clearRewards}
            onChange={setClearRewards}
          />

          <RewardScheduleSection<StarTierDraft>
            title={m.level_field_star_rewards()}
            list={starTiers}
            getId={(d) => d.id}
            keyLabel={(d) => `${d.stars} ★`}
            newDraft={() => {
              const maxStarsUsed = starTiers.reduce(
                (max, d) => Math.max(max, d.stars),
                0,
              )
              return {
                id: `tier-new-${Date.now()}`,
                stars: maxStarsUsed + 1,
                rewards: [],
              }
            }}
            KeyFields={StarKeyFields}
            validate={(d) => {
              if (!Number.isFinite(d.stars) || d.stars < 1) {
                return m.reward_key_required()
              }
              return null
            }}
            tracks={starTracks}
            onCreate={async (draft) => {
              setStarTiers((prev) => [...prev, draft])
            }}
            onUpdate={async (draft) => {
              setStarTiers((prev) =>
                prev.map((d) => (d.id === draft.id ? draft : d)),
              )
            }}
            onDelete={async (draft) => {
              setStarTiers((prev) => prev.filter((d) => d.id !== draft.id))
            }}
          />

          <div className="space-y-2">
            <Label>{m.level_field_metadata()}</Label>
            <Textarea
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              rows={3}
              placeholder="{}"
            />
          </div>

          <div className="space-y-2">
            <Label>{m.common_sort_order()}</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>{m.common_active()}</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/level/$configId" params={{ orgSlug, projectSlug, configId }}>
                  {m.common_cancel()}
                </Link>
              }
              variant="outline"
            />
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? m.common_loading()
                : m.common_create()}
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
