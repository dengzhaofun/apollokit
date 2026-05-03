import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateDialogueScriptInput,
  DialogueScript,
  UpdateDialogueScriptInput,
} from "#/lib/types/dialogue"

const SCRIPTS_KEY = ["dialogue-scripts"] as const

export const DIALOGUE_SCRIPT_FILTER_DEFS: FilterDef[] = []

/** Paginated dialogue scripts — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDialogueScripts(route: any) {
  return useListSearch<DialogueScript>({
    route,
    queryKey: SCRIPTS_KEY,
    filterDefs: DIALOGUE_SCRIPT_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<DialogueScript>>(
        `/api/v1/dialogue/scripts?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllDialogueScripts() {
  return useQuery({
    queryKey: [...SCRIPTS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<DialogueScript>>(`/api/v1/dialogue/scripts?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useDialogueScript(id: string) {
  return useQuery({
    queryKey: [...SCRIPTS_KEY, id],
    queryFn: () => api.get<DialogueScript>(`/api/v1/dialogue/scripts/${id}`),
    enabled: !!id,
  })
}

export function useCreateDialogueScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDialogueScriptInput) =>
      api.post<DialogueScript>("/api/v1/dialogue/scripts", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCRIPTS_KEY }),
  })
}

export function useUpdateDialogueScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateDialogueScriptInput
    }) =>
      api.patch<DialogueScript>(`/api/v1/dialogue/scripts/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY })
      qc.invalidateQueries({ queryKey: [...SCRIPTS_KEY, vars.id] })
    },
  })
}

export function useDeleteDialogueScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/dialogue/scripts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCRIPTS_KEY }),
  })
}
