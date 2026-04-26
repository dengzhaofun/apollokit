import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  Character,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "#/lib/types/character"

const CHARACTERS_KEY = ["characters"] as const

export const CHARACTER_FILTER_DEFS: FilterDef[] = []

/** Paginated characters — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCharacters(route: any) {
  return useListSearch<Character>({
    route,
    queryKey: CHARACTERS_KEY,
    filterDefs: CHARACTER_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Character>>(
        `/api/character/characters?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
