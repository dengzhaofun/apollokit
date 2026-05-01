import { useForm } from "@tanstack/react-form"

import type { CreateCurrencyInput } from "#/lib/types/currency"

export type CurrencyFormValues = {
  name: string
  alias: string
  description: string
  icon: string
  isActive: boolean
  activityId: string | null
}

export function useDefinitionForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateCurrencyInput>
  onSubmit: (values: CreateCurrencyInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      isActive: defaultValues?.isActive ?? true,
      activityId: defaultValues?.activityId ?? (null as string | null),
    } as CurrencyFormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        icon: value.icon || null,
        isActive: value.isActive,
        activityId: value.activityId,
      })
    },
  })
}

export type DefinitionFormApi = ReturnType<typeof useDefinitionForm>
