import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { authClient } from "#/lib/auth-client"

const ADMIN_KEYS_KEY = ["admin-keys"] as const

export function useAdminKeys() {
  return useQuery({
    queryKey: ADMIN_KEYS_KEY,
    queryFn: async () => {
      const orgId =
        await authClient.organization.getFullOrganization().then((r) => r.data?.id)
      const { data, error } = await authClient.apiKey.list({
        query: { configId: "admin", organizationId: orgId },
      })
      if (error) throw error
      return data?.apiKeys ?? []
    },
  })
}

export function useCreateAdminKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; expiresIn?: number; organizationId: string }) => {
      const { data, error } = await authClient.apiKey.create({
        configId: "admin",
        name: input.name,
        expiresIn: input.expiresIn,
        organizationId: input.organizationId,
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
