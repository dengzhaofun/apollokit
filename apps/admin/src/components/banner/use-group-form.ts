import { useForm } from "@tanstack/react-form"

import type {
  BannerGroup,
  BannerLayout,
  CreateBannerGroupInput,
} from "#/lib/types/banner"

export type BannerGroupFormValues = {
  alias: string
  name: string
  description: string
  layout: BannerLayout
  intervalMs: number
  isActive: boolean
}

export function useGroupForm({
  initial,
  defaultValues,
  onSubmit,
}: {
  initial?: BannerGroup
  defaultValues?: Partial<CreateBannerGroupInput>
  onSubmit: (values: CreateBannerGroupInput) => void | Promise<void>
}) {
  const activityId = defaultValues?.activityId ?? initial?.activityId ?? null

  return useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? initial?.alias ?? "",
      name: defaultValues?.name ?? initial?.name ?? "",
      description: defaultValues?.description ?? initial?.description ?? "",
      layout:
        (defaultValues?.layout as BannerLayout | undefined) ??
        (initial?.layout as BannerLayout | undefined) ??
        ("carousel" as BannerLayout),
      intervalMs: defaultValues?.intervalMs ?? initial?.intervalMs ?? 4000,
      isActive: defaultValues?.isActive ?? initial?.isActive ?? true,
    } as BannerGroupFormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        alias: value.alias.trim() ? value.alias.trim() : null,
        name: value.name.trim(),
        description: value.description.trim() ? value.description : null,
        layout: value.layout,
        intervalMs: value.intervalMs,
        isActive: value.isActive,
        activityId,
      })
    },
  })
}

export type GroupFormApi = ReturnType<typeof useGroupForm>
