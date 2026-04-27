import { useForm } from "@tanstack/react-form"

import type { CreateRankSeasonInput, RankTierConfig } from "#/lib/types/rank"

export type RankSeasonFormValues = {
  alias: string
  name: string
  description: string
  tierConfigId: string
  startAt: string
  endAt: string
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

export function useSeasonForm({
  tierConfigs,
  onSubmit,
}: {
  tierConfigs: RankTierConfig[]
  onSubmit: (values: CreateRankSeasonInput) => Promise<void> | void
}) {
  const now = new Date()
  const monthFromNow = new Date(now.getTime() + 30 * 86400000)

  return useForm({
    defaultValues: {
      alias: "",
      name: "",
      description: "",
      tierConfigId: tierConfigs[0]?.id ?? "",
      startAt: toDatetimeLocal(now.toISOString()),
      endAt: toDatetimeLocal(monthFromNow.toISOString()),
    } as RankSeasonFormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        alias: value.alias,
        name: value.name,
        description: value.description || null,
        tierConfigId: value.tierConfigId,
        startAt: new Date(value.startAt).toISOString(),
        endAt: new Date(value.endAt).toISOString(),
      })
    },
  })
}

export type SeasonFormApi = ReturnType<typeof useSeasonForm>
