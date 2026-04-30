import { useMemo } from "react"

import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  RewardScheduleSection,
  type RewardScheduleKeyFieldsProps,
  type RewardTrack,
} from "#/components/rewards/RewardScheduleSection"
import { useUpdateLeaderboardConfig } from "#/hooks/use-leaderboard"
import * as m from "#/paraglide/messages.js"
import type {
  LeaderboardConfig,
  RewardEntry,
  RewardTier,
} from "#/lib/types/leaderboard"

type Draft = {
  /** Synthetic id derived from the tier's index — leaderboard tiers have no
   *  natural id; we re-key the array on every render. */
  id: string
  index: number
  from: number
  to: number
  rewards: RewardEntry[]
}

function tiersToDrafts(tiers: RewardTier[]): Draft[] {
  return tiers.map((t, i) => ({
    id: `tier-${i}`,
    index: i,
    from: t.from,
    to: t.to,
    rewards: t.rewards,
  }))
}

function draftToTier(d: Draft): RewardTier {
  return { from: d.from, to: d.to, rewards: d.rewards }
}

function RankRangeFields({
  draft,
  onChange,
}: RewardScheduleKeyFieldsProps<Draft>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="rank-from">{m.leaderboard_rank_from()}</Label>
        <Input
          id="rank-from"
          type="number"
          min={1}
          value={draft.from}
          onChange={(e) =>
            onChange({ ...draft, from: Number(e.target.value) || 1 })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rank-to">{m.leaderboard_rank_to()}</Label>
        <Input
          id="rank-to"
          type="number"
          min={1}
          value={draft.to}
          onChange={(e) =>
            onChange({ ...draft, to: Number(e.target.value) || 1 })
          }
        />
      </div>
    </div>
  )
}

interface Props {
  config: LeaderboardConfig
}

export function LeaderboardRewardsBlock({ config }: Props) {
  const updateMutation = useUpdateLeaderboardConfig()
  const list = tiersToDrafts(config.rewardTiers ?? [])

  const tracks = useMemo<RewardTrack<Draft>[]>(
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

  async function persist(nextDrafts: Draft[]) {
    const tiers = nextDrafts
      .slice()
      .sort((a, b) => a.from - b.from)
      .map(draftToTier)
    await updateMutation.mutateAsync({
      id: config.id,
      rewardTiers: tiers,
    })
  }

  return (
    <RewardScheduleSection<Draft>
      anchorId="rewards"
      list={list}
      isPending={false}
      getId={(d) => d.id}
      keyLabel={(d) =>
        d.from === d.to ? `Rank ${d.from}` : `Rank ${d.from}-${d.to}`
      }
      newDraft={() => {
        const maxTo = list.reduce((max, d) => Math.max(max, d.to), 0)
        const next = maxTo + 1
        return {
          id: `tier-${list.length}`,
          index: list.length,
          from: next,
          to: next,
          rewards: [],
        }
      }}
      KeyFields={RankRangeFields}
      validate={(d) => {
        if (!Number.isFinite(d.from) || d.from < 1) return m.reward_key_required()
        if (!Number.isFinite(d.to) || d.to < d.from) return m.reward_key_required()
        return null
      }}
      tracks={tracks}
      onCreate={async (draft) => {
        await persist([...list, { ...draft, index: list.length }])
      }}
      onUpdate={async (draft) => {
        await persist(list.map((d) => (d.id === draft.id ? draft : d)))
      }}
      onDelete={async (draft) => {
        await persist(list.filter((d) => d.id !== draft.id))
      }}
    />
  )
}
