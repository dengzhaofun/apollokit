import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
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

export const ENTITY_SCHEMA_FILTER_DEFS: FilterDef[] = []

/** Paginated entity schemas — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntitySchemas(route: any) {
  return useListSearch<EntitySchema>({
    route,
    queryKey: SCHEMAS_KEY,
    filterDefs: ENTITY_SCHEMA_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<EntitySchema>>(
        `/api/entity/schemas?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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

export const ENTITY_BLUEPRINT_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated entity blueprints — URL-driven. Default scope: permanent
 * / non-activity-bound only. Activity detail pages pass an explicit
 * `activityId` to scope to that activity.
 */
export function useEntityBlueprints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extraQuery: { schemaId?: string; activityId?: string } = {},
) {
  const { schemaId, activityId } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<EntityBlueprint>({
    route,
    queryKey: [
      ...BLUEPRINTS_KEY,
      { schemaId: schemaId ?? null, activityId: effectiveActivityId },
    ],
    filterDefs: ENTITY_BLUEPRINT_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<EntityBlueprint>>(
        `/api/entity/blueprints?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          schemaId,
          activityId: effectiveActivityId,
        })}`,
      ),
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

export const ENTITY_FORMATION_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated formation configs — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntityFormationConfigs(route: any) {
  return useListSearch<EntityFormationConfig>({
    route,
    queryKey: FORMATION_CONFIGS_KEY,
    filterDefs: ENTITY_FORMATION_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<EntityFormationConfig>>(
        `/api/entity/formation-configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
