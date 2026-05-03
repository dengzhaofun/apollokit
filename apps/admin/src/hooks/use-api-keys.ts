import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { authClient } from "#/lib/auth-client"

const ADMIN_KEYS_KEY = ["admin-keys"] as const

/**
 * In the dual-tenant model, api keys are PROJECT-scoped (one key works
 * inside exactly one Better Auth team). The Better Auth apikey plugin's
 * `references` only supports `"user"` / `"organization"`, so we keep
 * the row referenceId at the org level but encode project scope in
 * `metadata.teamId`. The list query returns ALL keys in the active
 * organization, then we filter client-side by `metadata.teamId` so the
 * UI looks identical to a native project-level apikey system.
 */
function readTeamId(metadata: unknown): string | null {
  let m: Record<string, unknown> | null = null
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata)
      m = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
    } catch {
      m = null
    }
  } else if (metadata && typeof metadata === "object") {
    m = metadata as Record<string, unknown>
  }
  if (!m) return null
  return typeof m.teamId === "string" ? m.teamId : null
}

export function useAdminKeys() {
  const { data: session } = authClient.useSession()
  const activeTeamId = session?.session.activeTeamId ?? null
  return useQuery({
    queryKey: [...ADMIN_KEYS_KEY, activeTeamId] as const,
    enabled: Boolean(activeTeamId),
    queryFn: async () => {
      const orgId =
        await authClient.organization.getFullOrganization().then((r) => r.data?.id)
      const { data, error } = await authClient.apiKey.list({
        query: { configId: "admin", organizationId: orgId },
      })
      if (error) throw error
      const all = data?.apiKeys ?? []
      // Project-scope filter: only keys created for this team. Legacy
      // keys (no metadata.teamId) are hidden — server-side middleware
      // also rejects them, so listing them would be misleading.
      return all.filter((k) => readTeamId(k.metadata) === activeTeamId)
    },
  })
}

export function useCreateAdminKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      expiresIn?: number
      organizationId: string
      // tenantId is the active project (Better Auth team) — required so
      // the server-side middleware can pin this key to one project via
      // metadata.teamId. Keys without it are rejected as unscoped.
      tenantId: string
    }) => {
      const { data, error } = await authClient.apiKey.create({
        configId: "admin",
        name: input.name,
        expiresIn: input.expiresIn,
        organizationId: input.organizationId,
        metadata: { teamId: input.tenantId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS_KEY }),
  })
}

export function useRevokeAdminKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: string) => {
      const { data, error } = await authClient.apiKey.delete({
        configId: "admin",
        keyId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS_KEY }),
  })
}
