import { useForm } from "@tanstack/react-form"

import type {
  Character,
  CharacterSide,
  CreateCharacterInput,
} from "#/lib/types/character"

export type CharacterFormValues = {
  name: string
  alias: string
  description: string
  avatarUrl: string
  portraitUrl: string
  defaultSide: CharacterSide | null
  isActive: boolean
}

export function buildCharacterDefaults(
  initial?: Character,
): CharacterFormValues {
  return {
    name: initial?.name ?? "",
    alias: initial?.alias ?? "",
    description: initial?.description ?? "",
    avatarUrl: initial?.avatarUrl ?? "",
    portraitUrl: initial?.portraitUrl ?? "",
    defaultSide: (initial?.defaultSide ?? null) as CharacterSide | null,
    isActive: initial?.isActive ?? true,
  }
}

export function toCreateCharacterInput(
  value: CharacterFormValues,
): CreateCharacterInput {
  return {
    name: value.name.trim(),
    alias: value.alias.trim() ? value.alias.trim() : null,
    description: value.description.trim() ? value.description : null,
    avatarUrl: value.avatarUrl.trim() ? value.avatarUrl : null,
    portraitUrl: value.portraitUrl.trim() ? value.portraitUrl : null,
    defaultSide: value.defaultSide,
    isActive: value.isActive,
  }
}

export function useCharacterForm({
  initial,
  onSubmit,
}: {
  initial?: Character
  onSubmit: (values: CreateCharacterInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: buildCharacterDefaults(initial),
    onSubmit: async ({ value }) => {
      await onSubmit(toCreateCharacterInput(value))
    },
  })
}

export type CharacterFormApi = ReturnType<typeof useCharacterForm>
