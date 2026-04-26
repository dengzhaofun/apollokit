import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateFriendGiftPackageInput,
  FriendGiftPackage,
  FriendGiftSend,
  FriendGiftSettings,
  UpdateFriendGiftPackageInput,
  UpsertFriendGiftSettingsInput,
} from "#/lib/types/friend-gift"

const SETTINGS_KEY = ["friend-gift-settings"] as const
const PACKAGES_KEY = ["friend-gift-packages"] as const
const SENDS_KEY = ["friend-gift-sends"] as const

export function useFriendGiftSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<FriendGiftSettings>("/api/friend-gift/settings"),
  })
}

export function useUpsertFriendGiftSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertFriendGiftSettingsInput) =>
      api.put<FriendGiftSettings>("/api/friend-gift/settings", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

/** Paginated friend-gift packages — for the admin packages table. */
export function useFriendGiftPackages(initialPageSize = 50) {
  return useCursorList<FriendGiftPackage>({
    queryKey: PACKAGES_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<FriendGiftPackage>>(
        `/api/friend-gift/packages?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllFriendGiftPackages() {
  return useQuery({
    queryKey: [...PACKAGES_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<FriendGiftPackage>>(
          `/api/friend-gift/packages?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
  })
}

export function useFriendGiftPackage(id: string) {
  return useQuery({
    queryKey: [...PACKAGES_KEY, id],
    queryFn: () =>
      api.get<FriendGiftPackage>(`/api/friend-gift/packages/${id}`),
    enabled: !!id,
  })
}

export function useCreateFriendGiftPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFriendGiftPackageInput) =>
      api.post<FriendGiftPackage>("/api/friend-gift/packages", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  })
}

export function useUpdateFriendGiftPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateFriendGiftPackageInput
    }) => api.patch<FriendGiftPackage>(`/api/friend-gift/packages/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  })
}

export function useDeleteFriendGiftPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/friend-gift/packages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  })
}

/** Paginated friend-gift sends — admin audit log. */
export function useFriendGiftSends(initialPageSize = 50) {
  return useCursorList<FriendGiftSend>({
    queryKey: SENDS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<FriendGiftSend>>(
        `/api/friend-gift/sends?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
  })
}
