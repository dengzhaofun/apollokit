import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  EntitySchema,
  EntityBlueprint,
  EntityBlueprintSkin,
  EntityFormationConfig,
  CreateSchemaInput,
  UpdateSchemaInput,
  CreateBlueprintInput,
  UpdateBlueprintInput,
  CreateSkinInput,
  UpdateSkinInput,
  CreateFormationConfigInput,
  UpdateFormationConfigInput,
} from "#/lib/types/entity"

const SCHEMAS_KEY = ["entity-schemas"] as const
const BLUEPRINTS_KEY = ["entity-blueprints"] as const
const SKINS_KEY = ["entity-skins"] as const
const FORMATION_CONFIGS_KEY = ["entity-formation-configs"] as const

// ─── Schemas ─────────────────────────────────────────────────────

/** Paginated entity schemas — for the SchemaTable. */
export function useEntitySchemas(initialPageSize = 50) {
  return useCursorList<EntitySchema>({
    queryKey: SCHEMAS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<EntitySchema>>(`/api/entity/schemas?${buildQs({ cursor, limit, q })}`),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllEntitySchemas() {
  return useQuery({
    queryKey: [...SCHEMAS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<EntitySchema>>(`/api/entity/schemas?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useEntitySchema(key: string) {
  return useQuery({
    queryKey: [...SCHEMAS_KEY, key],
    queryFn: () => api.get<EntitySchema>(`/api/entity/schemas/${key}`),
    enabled: !!key,
  })
}

export function useCreateEntitySchema() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSchemaInput) =>
      api.post<EntitySchema>("/api/entity/schemas", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEMAS_KEY }),
  })
}

export function useUpdateEntitySchema() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSchemaInput & { id: string }) =>
      api.patch<EntitySchema>(`/api/entity/schemas/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEMAS_KEY }),
  })
}

export function useDeleteEntitySchema() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/entity/schemas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEMAS_KEY }),
  })
}

// ─── Blueprints ──────────────────────────────────────────────────

export function useEntityBlueprints(
  opts: { schemaId?: string; initialPageSize?: number } = {},
) {
  const { schemaId, initialPageSize = 50 } = opts
  return useCursorList<EntityBlueprint>({
    queryKey: [...BLUEPRINTS_KEY, { schemaId: schemaId ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<EntityBlueprint>>(
        `/api/entity/blueprints?${buildQs({ cursor, limit, q, schemaId })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllEntityBlueprints(opts: { schemaId?: string } = {}) {
  const { schemaId } = opts
  return useQuery({
    queryKey: [...BLUEPRINTS_KEY, "all", { schemaId: schemaId ?? null }],
    queryFn: () =>
      api
        .get<Page<EntityBlueprint>>(
          `/api/entity/blueprints?${buildQs({ limit: 200, schemaId })}`,
        )
        .then((p) => p.items),
  })
}

export function useEntityBlueprint(key: string) {
  return useQuery({
    queryKey: [...BLUEPRINTS_KEY, "detail", key],
    queryFn: () =>
      api.get<EntityBlueprint>(`/api/entity/blueprints/${key}`),
    enabled: !!key,
  })
}

export function useCreateEntityBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBlueprintInput) =>
      api.post<EntityBlueprint>("/api/entity/blueprints", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BLUEPRINTS_KEY }),
  })
}

export function useUpdateEntityBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBlueprintInput & { id: string }) =>
      api.patch<EntityBlueprint>(`/api/entity/blueprints/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BLUEPRINTS_KEY }),
  })
}

export function useDeleteEntityBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/entity/blueprints/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: BLUEPRINTS_KEY }),
  })
}

// ─── Skins ───────────────────────────────────────────────────────

export function useEntitySkins(blueprintId: string) {
  return useQuery({
    queryKey: [...SKINS_KEY, blueprintId],
    queryFn: () =>
      api.get<EntityBlueprintSkin[]>(
        `/api/entity/blueprints/${blueprintId}/skins`,
      ),
    enabled: !!blueprintId,
  })
}

export function useCreateEntitySkin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      blueprintId,
      ...input
    }: CreateSkinInput & { blueprintId: string }) =>
      api.post<EntityBlueprintSkin>(
        `/api/entity/blueprints/${blueprintId}/skins`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKINS_KEY }),
  })
}

export function useUpdateEntitySkin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skinId, ...input }: UpdateSkinInput & { skinId: string }) =>
      api.patch<EntityBlueprintSkin>(
        `/api/entity/skins/${skinId}`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKINS_KEY }),
  })
}

export function useDeleteEntitySkin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (skinId: string) =>
      api.delete(`/api/entity/skins/${skinId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SKINS_KEY }),
  })
}

// ─── Formation Configs ───────────────────────────────────────────

/** Paginated formation configs — for the FormationConfigTable. */
export function useEntityFormationConfigs(initialPageSize = 50) {
  return useCursorList<EntityFormationConfig>({
    queryKey: FORMATION_CONFIGS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<EntityFormationConfig>>(
        `/api/entity/formation-configs?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllEntityFormationConfigs() {
  return useQuery({
    queryKey: [...FORMATION_CONFIGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<EntityFormationConfig>>(
          `/api/entity/formation-configs?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
  })
}

export function useCreateEntityFormationConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFormationConfigInput) =>
      api.post<EntityFormationConfig>(
        "/api/entity/formation-configs",
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: FORMATION_CONFIGS_KEY }),
  })
}

export function useUpdateEntityFormationConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateFormationConfigInput & { id: string }) =>
      api.patch<EntityFormationConfig>(
        `/api/entity/formation-configs/${id}`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: FORMATION_CONFIGS_KEY }),
  })
}

export function useDeleteEntityFormationConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/entity/formation-configs/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: FORMATION_CONFIGS_KEY }),
  })
}
