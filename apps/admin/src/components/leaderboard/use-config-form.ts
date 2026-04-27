import { useForm } from "@tanstack/react-form"

import type {
  AggregationMode,
  ConfigStatus,
  CreateLeaderboardInput,
  CycleMode,
  RewardTier,
  ScopeMode,
  TieBreaker,
} from "#/lib/types/leaderboard"

export type LeaderboardFormValues = {
  alias: string
  name: string
  description: string
  metricKey: string
  cycle: CycleMode
  weekStartsOn: number
  timezone: string
  scope: ScopeMode
  aggregation: AggregationMode
  maxEntries: number
  tieBreaker: TieBreaker
  status: ConfigStatus
  activityId: string | null
  rewardTiersJson: string
}

export function useLeaderboardForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateLeaderboardInput>
  onSubmit: (values: CreateLeaderboardInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? "",
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      metricKey: defaultValues?.metricKey ?? "",
      cycle: defaultValues?.cycle ?? ("daily" as CycleMode),
      weekStartsOn: defaultValues?.weekStartsOn ?? 1,
      timezone:
        defaultValues?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      scope: defaultValues?.scope ?? ("global" as ScopeMode),
      aggregation: defaultValues?.aggregation ?? ("sum" as AggregationMode),
      maxEntries: defaultValues?.maxEntries ?? 1000,
      tieBreaker: defaultValues?.tieBreaker ?? ("earliest" as TieBreaker),
      status: defaultValues?.status ?? ("active" as ConfigStatus),
      activityId: defaultValues?.activityId ?? (null as string | null),
      rewardTiersJson: JSON.stringify(
        defaultValues?.rewardTiers ?? [],
        null,
        2,
      ),
    } satisfies LeaderboardFormValues,
    onSubmit: async ({ value }) => {
      let tiers: RewardTier[] = []
      try {
        tiers = JSON.parse(value.rewardTiersJson) as RewardTier[]
      } catch {
        tiers = []
      }
      await onSubmit({
        alias: value.alias,
        name: value.name,
        description: value.description || null,
        metricKey: value.metricKey,
        cycle: value.cycle,
        weekStartsOn: value.weekStartsOn,
        timezone: value.timezone,
        scope: value.scope,
        aggregation: value.aggregation,
        maxEntries: value.maxEntries,
        tieBreaker: value.tieBreaker,
        status: value.status,
        activityId: value.activityId,
        rewardTiers: tiers,
      })
    },
  })
}

export type LeaderboardFormApi = ReturnType<typeof useLeaderboardForm>
