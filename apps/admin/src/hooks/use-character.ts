import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  Character,
  CharacterListResponse,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "#/lib/types/character"

const CHARACTERS_KEY = ["characters"] as const

export function useCharacters() {
  return useQuery({
    queryKey: CHARACTERS_KEY,
    queryFn: () => api.get<CharacterListResponse>("/api/character/characters"),
    select: (data) => data.items,
  })
}

export function useCharacter(id: string) {
  return useQuery({
    queryKey: [...CHARACTERS_KEY, id],
    queryFn: () => api.get<Character>(`/api/character/characters/${id}`),
    enabled: !!id,
  })
}

export function useCreateCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCharacterInput) =>
      api.post<Character>("/api/character/characters", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHARACTERS_KEY }),
  })
}

export function useUpdateCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateCharacterInput
    }) => api.patch<Character>(`/api/character/characters/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CHARACTERS_KEY })
      qc.invalidateQueries({ queryKey: [...CHARACTERS_KEY, vars.id] })
    },
  })
}

export function useDeleteCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/character/characters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHARACTERS_KEY }),
  })
}
