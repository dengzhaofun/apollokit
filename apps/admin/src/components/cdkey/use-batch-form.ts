import { useForm } from "@tanstack/react-form"

import type { CdkeyCodeType, CreateBatchInput } from "#/lib/types/cdkey"
import type { RewardEntry } from "#/lib/types/rewards"

export type CdkeyBatchFormValues = {
  name: string
  alias: string
  description: string
  codeType: CdkeyCodeType
  universalCode: string
  initialCount: number
  totalLimit: string
  perUserLimit: number
  startsAt: string
  endsAt: string
  isActive: boolean
  reward: RewardEntry[]
}

export function useBatchForm({
  onSubmit,
}: {
  onSubmit: (values: CreateBatchInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      name: "",
      alias: "",
      description: "",
      codeType: "universal" as CdkeyCodeType,
      universalCode: "",
      initialCount: 100,
      totalLimit: "",
      perUserLimit: 1,
      startsAt: "",
      endsAt: "",
      isActive: true,
      reward: [] as RewardEntry[],
    } as CdkeyBatchFormValues,
    onSubmit: async ({ value }) => {
      if (value.reward.length === 0) return
      const input: CreateBatchInput = {
        name: value.name,
        alias: value.alias.trim() || null,
        description: value.description.trim() || null,
        codeType: value.codeType,
        reward: value.reward,
        perUserLimit: value.perUserLimit,
        isActive: value.isActive,
        startsAt: value.startsAt ? new Date(value.startsAt).toISOString() : null,
        endsAt: value.endsAt ? new Date(value.endsAt).toISOString() : null,
      }
      if (value.codeType === "universal") {
        input.totalLimit = value.totalLimit ? Number(value.totalLimit) : null
        if (value.universalCode.trim()) input.universalCode = value.universalCode.trim()
      } else {
        input.initialCount = value.initialCount
      }
      await onSubmit(input)
    },
  })
}

export type BatchFormApi = ReturnType<typeof useBatchForm>
