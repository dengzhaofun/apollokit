import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  ConfigListResponse,
  CreateConfigInput,
  CreateLevelInput,
  CreateStageInput,
  Level,
  LevelConfig,
  LevelListResponse,
  LevelStage,
  StageListResponse,
  UpdateConfigInput,
  UpdateLevelInput,
  UpdateStageInput,
} from "#/lib/types/level"

const CONFIGS_KEY = ["level-configs"] as const
const configKey = (key: string) => ["level-config", key] as const
const stagesKey = (configId: string) =>
  ["level-config", configId, "stages"] as const
const levelsKey = (configId: string) =>
  ["level-config", configId, "levels"] as const
const levelKey = (id: string) => ["level", id] as const

// ─── Configs ─────────────────────────────────────────────────────

export function useLevelConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: () => api.get<ConfigListResponse>("/api/v1/level/configs"),
    select: (data) => data.items,
  })
}

export function useLevelConfig(key: string) {
  return useQuery({
    queryKey: configKey(key),
    queryFn: () => api.get<LevelConfig>(`/api/v1/level/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateLevelConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConfigInput) =>
      api.post<LevelConfig>("/api/v1/level/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateLevelConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConfigInput }) =>
      api.put<LevelConfig>(`/api/v1/level/configs/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CONFIGS_KEY })
      qc.invalidateQueries({ queryKey: configKey(vars.id) })
    },
  })
}

export function useDeleteLevelConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/level/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

// ─── Stages ──────────────────────────────────────────────────────

export function useLevelStages(configId: string) {
  return useQuery({
    queryKey: stagesKey(configId),
    queryFn: () =>
      api.get<StageListResponse>(
        `/api/v1/level/configs/${configId}/stages`,
      ),
    select: (data) => data.items,
    enabled: !!configId,
  })
}

export function useCreateLevelStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      configId,
      input,
    }: {
      configId: string
      input: CreateStageInput
    }) =>
      api.post<LevelStage>(
        `/api/v1/level/configs/${configId}/stages`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: stagesKey(vars.configId) })
    },
  })
}

export function useUpdateLevelStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      configId: string
      input: UpdateStageInput
    }) => api.put<LevelStage>(`/api/v1/level/stages/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: stagesKey(vars.configId) })
    },
  })
}

export function useDeleteLevelStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; configId: string }) =>
      api.delete(`/api/v1/level/stages/${id}`),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: stagesKey(vars.configId) })
      qc.invalidateQueries({ queryKey: levelsKey(vars.configId) })
    },
  })
}

// ─── Levels ──────────────────────────────────────────────────────

export function useLevels(configId: string, stageId?: string) {
  return useQuery({
    queryKey: [...levelsKey(configId), stageId ?? "all"],
    queryFn: () =>
      api.get<LevelListResponse>(
        `/api/v1/level/configs/${configId}/levels${stageId ? `?stageId=${stageId}` : ""}`,
      ),
    select: (data) => data.items,
    enabled: !!configId,
  })
}

export function useLevel(id: string) {
  return useQuery({
    queryKey: levelKey(id),
    queryFn: () => api.get<Level>(`/api/v1/level/levels/${id}`),
    enabled: !!id,
  })
}

export function useCreateLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      configId,
      input,
    }: {
      configId: string
      input: CreateLevelInput
    }) =>
      api.post<Level>(
        `/api/v1/level/configs/${configId}/levels`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: levelsKey(vars.configId) })
    },
  })
}

export function useUpdateLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      configId: string
      input: UpdateLevelInput
    }) => api.put<Level>(`/api/v1/level/levels/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: levelsKey(vars.configId) })
      qc.invalidateQueries({ queryKey: levelKey(vars.id) })
    },
  })
}

export function useDeleteLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; configId: string }) =>
      api.delete(`/api/v1/level/levels/${id}`),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: levelsKey(vars.configId) })
    },
  })
}
