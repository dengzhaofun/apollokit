import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CollectionDeleteDialog } from "#/components/collection/DeleteDialog"
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
import {
  useDeleteLevel,
  useLevel,
  useLevelConfig,
  useLevelStages,
  useUpdateLevel,
} from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { RewardEntry, StarRewardTier } from "#/lib/types/level"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/level/$configId/levels/$levelId",
)({
  component: LevelDetailPage,
})

function LevelDetailPage() {
  const { configId, levelId } = Route.useParams()
  const navigate = useNavigate()
  const { data: config } = useLevelConfig(configId)
  const { data: level, isPending, error } = useLevel(levelId)
  const { data: stages = [] } = useLevelStages(configId)
  const updateMutation = useUpdateLevel()
  const deleteMutation = useDeleteLevel()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !level) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.level_failed_load()} {error?.message ?? m.level_not_found()}
      </div>
    )
  }

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/level/$configId" params={{ configId }}>
              <ArrowLeft className="size-4" />
            </Link>
          }
          variant="ghost" size="icon"
        />
        <div className="ml-auto">
          <CollectionDeleteDialog
            title={m.level_edit_level()}
            description={m.level_delete_level_desc()}
            onConfirm={async () => {
              try {
                await deleteMutation.mutateAsync({ id: levelId, configId })
                toast.success(m.level_level_deleted())
                navigate({ to: "/level/$configId", params: { configId } })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.level_failed_delete())
              }
            }}
            isPending={deleteMutation.isPending}
          />
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <LevelEditForm
          configId={configId}
          levelId={levelId}
          initial={level}
          stages={stages}
          hasStages={config?.hasStages ?? false}
          updateMutation={updateMutation}
        />
      </main>
    </>
  )
}

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

function tiersToDrafts(tiers: StarRewardTier[] | null): StarTierDraft[] {
  return (tiers ?? []).map((t, i) => ({
    id: `tier-${i}`,
    stars: t.stars,
    rewards: t.rewards,
  }))
}

function LevelEditForm({
  configId,
  levelId,
  initial,
  stages,
  hasStages,
  updateMutation,
}: {
  configId: string
  levelId: string
  initial: NonNullable<ReturnType<typeof useLevel>["data"]>
  stages: NonNullable<ReturnType<typeof useLevelStages>["data"]>
  hasStages: boolean
  updateMutation: ReturnType<typeof useUpdateLevel>
}) {
  const [name, setName] = useState(initial.name)
  const [alias, setAlias] = useState(initial.alias ?? "")
  const [description, setDescription] = useState(initial.description ?? "")
  const [icon, setIcon] = useState(initial.icon ?? "")
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? "")
  const [maxStars, setMaxStars] = useState(initial.maxStars)
  const [stageId, setStageId] = useState(initial.stageId ?? "")
  const [unlockRule, setUnlockRule] = useState(
    initial.unlockRule ? JSON.stringify(initial.unlockRule, null, 2) : "",
  )
  const [clearRewards, setClearRewards] = useState<RewardEntry[]>(
    initial.clearRewards ?? [],
  )
  const [starTiers, setStarTiers] = useState<StarTierDraft[]>(
    tiersToDrafts(initial.starRewards),
  )
  const [metadata, setMetadata] = useState(
    initial.metadata ? JSON.stringify(initial.metadata, null, 2) : "",
  )
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)
  const [isActive, setIsActive] = useState(initial.isActive)

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
      await updateMutation.mutateAsync({
        id: levelId,
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
          sortOrder,
          isActive,
        },
      })
      toast.success(m.level_level_saved())
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.level_failed_save())
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="space-y-2">
        <Label>{m.level_field_name()}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_alias()}</Label>
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
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
          placeholder="easy / normal / hard"
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

      {hasStages && stages.length > 0 && (
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
            <Link to="/level/$configId" params={{ configId }}>
              {m.level_back_to_list()}
            </Link>
          }
          variant="outline"
        />
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending
            ? m.common_saving()
            : m.common_save_changes()}
        </Button>
      </div>
    </form>
  )
}
