/**
 * Externalized form state for the check-in create/edit drawer.
 *
 * Why this hook exists: the AI assist panel needs to write field values
 * directly into the same form instance the user is editing. TanStack
 * Form's `useForm` returns a controller that can do this via
 * `form.setFieldValue(...)`, but only if the caller (the parent
 * component, not `ConfigForm` itself) holds a reference to it.
 *
 * Shape choice: this is the **internal** form-state shape (every field
 * concrete, no optionals), which differs from `CreateConfigInput` (the
 * server contract — many fields are optional). The `onSubmit` adapter
 * inside the drawer translates between the two so server validation
 * still sees the right thing for omitted-vs-null fields.
 */

import { useForm } from "@tanstack/react-form"

import type { CreateConfigInput, ResetMode } from "#/lib/types/check-in"

export type CheckInFormValues = {
  name: string
  alias: string
  description: string
  resetMode: ResetMode
  weekStartsOn: number
  target: number | null
  timezone: string
  isActive: boolean
  activityId: string | null
}

export function buildDefaultValues(
  defaultValues?: Partial<CreateConfigInput>,
): CheckInFormValues {
  return {
    name: defaultValues?.name ?? "",
    alias: defaultValues?.alias ?? "",
    description: defaultValues?.description ?? "",
    resetMode: defaultValues?.resetMode ?? ("none" as ResetMode),
    weekStartsOn: defaultValues?.weekStartsOn ?? 1,
    target: defaultValues?.target ?? null,
    timezone:
      defaultValues?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    isActive: defaultValues?.isActive ?? true,
    activityId: defaultValues?.activityId ?? null,
  }
}

/** Map internal form values onto the server's `CreateConfigInput` shape. */
export function toCreateConfigInput(value: CheckInFormValues): CreateConfigInput {
  return {
    name: value.name,
    resetMode: value.resetMode,
    weekStartsOn: value.weekStartsOn,
    timezone: value.timezone,
    isActive: value.isActive,
    alias: value.alias || null,
    description: value.description || null,
    target: value.target,
    activityId: value.activityId,
  }
}

export function useConfigForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateConfigInput>
  onSubmit: (values: CreateConfigInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: buildDefaultValues(defaultValues),
    onSubmit: async ({ value }) => {
      await onSubmit(toCreateConfigInput(value))
    },
  })
}

export type CheckInFormApi = ReturnType<typeof useConfigForm>
