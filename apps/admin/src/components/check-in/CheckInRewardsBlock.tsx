import { useMemo } from "react"

import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  RewardScheduleSection,
  type RewardScheduleKeyFieldsProps,
  type RewardTrack,
} from "#/components/rewards/RewardScheduleSection"
import {
  useCheckInRewards,
  useCreateCheckInReward,
  useUpdateCheckInReward,
  useDeleteCheckInReward,
} from "#/hooks/use-check-in-rewards"
import * as m from "#/paraglide/messages.js"
import type { CheckInReward } from "#/lib/types/check-in-reward"
import type { RewardEntry } from "#/lib/types/rewards"

type Draft = {
  id: string
  dayNumber: number
  rewardItems: RewardEntry[]
}

function DayKeyFields({
  draft,
  onChange,
}: RewardScheduleKeyFieldsProps<Draft>) {
  return (
    <div className="space-y-2">
      <Label htmlFor="reward-day">{m.checkin_day_number_label()}</Label>
      <Input
        id="reward-day"
        type="number"
        min={1}
        value={draft.dayNumber}
        onChange={(e) =>
          onChange({ ...draft, dayNumber: Number(e.target.value) || 1 })
        }
      />
      <p className="text-xs text-muted-foreground">
        {m.checkin_day_number_hint()}
      </p>
    </div>
  )
}

function toDraft(reward: CheckInReward): Draft {
  return {
    id: reward.id,
    dayNumber: reward.dayNumber,
    rewardItems: reward.rewardItems,
  }
}

interface Props {
  configKey: string
}

export function CheckInRewardsBlock({ configKey }: Props) {
  const { data: rewards, isPending } = useCheckInRewards(configKey)
  const createMutation = useCreateCheckInReward()
  const updateMutation = useUpdateCheckInReward()
  const deleteMutation = useDeleteCheckInReward()

  const list = (rewards ?? [])
    .map(toDraft)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const nextDay =
    list.length === 0 ? 1 : Math.max(...list.map((r) => r.dayNumber)) + 1

  const tracks = useMemo<RewardTrack<Draft>[]>(
    () => [
      {
        id: "main",
        label: m.reward_section_title(),
        getRewards: (d) => d.rewardItems,
        setRewards: (d, rewardItems) => ({ ...d, rewardItems }),
      },
    ],
    [],
  )

  return (
    <RewardScheduleSection<Draft>
      anchorId="rewards"
      highlightAddOnMount
      list={list}
      isPending={isPending}
      getId={(d) => d.id}
      keyLabel={(d) => `Day ${d.dayNumber}`}
      newDraft={() => ({
        id: "",
        dayNumber: nextDay,
        rewardItems: [],
      })}
      KeyFields={DayKeyFields}
      validate={(d) => {
        if (!Number.isFinite(d.dayNumber) || d.dayNumber < 1) {
          return m.reward_key_required()
        }
        return null
      }}
      tracks={tracks}
      onCreate={async (draft) => {
        await createMutation.mutateAsync({
          configKey,
          dayNumber: draft.dayNumber,
          rewardItems: draft.rewardItems,
        })
      }}
      onUpdate={async (draft) => {
        await updateMutation.mutateAsync({
          rewardId: draft.id,
          dayNumber: draft.dayNumber,
          rewardItems: draft.rewardItems,
        })
      }}
      onDelete={async (draft) => {
        await deleteMutation.mutateAsync(draft.id)
      }}
    />
  )
}
