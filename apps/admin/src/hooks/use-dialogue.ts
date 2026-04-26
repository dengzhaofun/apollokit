import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateDialogueScriptInput,
  DialogueScript,
  UpdateDialogueScriptInput,
} from "#/lib/types/dialogue"

const SCRIPTS_KEY = ["dialogue-scripts"] as const

/** Paginated dialogue scripts — for the admin scripts table. */
export function useDialogueScripts(initialPageSize = 50) {
  return useCursorList<DialogueScript>({
    queryKey: SCRIPTS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<DialogueScript>>(
        `/api/dialogue/scripts?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllDialogueScripts() {
  return useQuery({
    queryKey: [...SCRIPTS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<DialogueScript>>(`/api/dialogue/scripts?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useDialogueScript(id: string) {
  return useQuery({
    queryKey: [...SCRIPTS_KEY, id],
    queryFn: () => api.get<DialogueScript>(`/api/dialogue/scripts/${id}`),
    enabled: !!id,
  })
}

export function useCreateDialogueScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDialogueScriptInput) =>
      api.post<DialogueScript>("/api/dialogue/scripts", input),
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
      api.patch<DialogueScript>(`/api/dialogue/scripts/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY })
      qc.invalidateQueries({ queryKey: [...SCRIPTS_KEY, vars.id] })
    },
  })
}

export function useDeleteDialogueScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/dialogue/scripts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCRIPTS_KEY }),
  })
}
