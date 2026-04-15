import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateDialogueScriptInput,
  DialogueScript,
  DialogueScriptListResponse,
  UpdateDialogueScriptInput,
} from "#/lib/types/dialogue"

const SCRIPTS_KEY = ["dialogue-scripts"] as const

export function useDialogueScripts() {
  return useQuery({
    queryKey: SCRIPTS_KEY,
    queryFn: () =>
      api.get<DialogueScriptListResponse>("/api/dialogue/scripts"),
    select: (data) => data.items,
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
