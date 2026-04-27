import { useForm } from "@tanstack/react-form"

import type { CreateTeamConfigInput } from "#/lib/types/team"

export type TeamConfigFormValues = {
  name: string
  alias: string
  maxMembers: number
  autoDissolveOnLeaderLeave: boolean
  allowQuickMatch: boolean
}

export function useTeamConfigForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateTeamConfigInput>
  onSubmit: (values: CreateTeamConfigInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      maxMembers: defaultValues?.maxMembers ?? 4,
      autoDissolveOnLeaderLeave: defaultValues?.autoDissolveOnLeaderLeave ?? false,
      allowQuickMatch: defaultValues?.allowQuickMatch ?? false,
    } as TeamConfigFormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name,
        alias: value.alias || null,
        maxMembers: value.maxMembers,
        autoDissolveOnLeaderLeave: value.autoDissolveOnLeaderLeave,
        allowQuickMatch: value.allowQuickMatch,
      })
    },
  })
}

export type TeamConfigFormApi = ReturnType<typeof useTeamConfigForm>
