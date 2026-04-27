import { useForm } from "@tanstack/react-form"

import type { CreatePoolInput } from "#/lib/types/lottery"

export type LotteryPoolFormValues = {
  name: string
  alias: string
  description: string
  isActive: boolean
  globalPullLimit: number | null
  activityId: string | null
}

export function useLotteryPoolForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreatePoolInput>
  onSubmit: (values: CreatePoolInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      isActive: defaultValues?.isActive ?? true,
      globalPullLimit: defaultValues?.globalPullLimit ?? (null as number | null),
      activityId: defaultValues?.activityId ?? (null as string | null),
    } as LotteryPoolFormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        isActive: value.isActive,
        globalPullLimit: value.globalPullLimit,
        activityId: value.activityId,
      })
    },
  })
}

export type LotteryPoolFormApi = ReturnType<typeof useLotteryPoolForm>
