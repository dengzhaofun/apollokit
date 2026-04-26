import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  Character,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "#/lib/types/character"

const CHARACTERS_KEY = ["characters"] as const

/** Paginated characters — for the admin table. */
export function useCharacters(initialPageSize = 50) {
  return useCursorList<Character>({
    queryKey: CHARACTERS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<Character>>(
        `/api/character/characters?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllCharacters() {
  return useQuery({
    queryKey: [...CHARACTERS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<Character>>(`/api/character/characters?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
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
