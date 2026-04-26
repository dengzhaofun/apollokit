import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"

const FRIEND_GIFT_PACKAGE_FILTER_DEFS: FilterDef[] = []
const FRIEND_GIFT_SEND_FILTER_DEFS: FilterDef[] = []
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

/** URL-driven friend-gift packages — for the admin packages table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFriendGiftPackages(route: any) {
  return useListSearch<FriendGiftPackage>({
    route,
    queryKey: PACKAGES_KEY,
    filterDefs: FRIEND_GIFT_PACKAGE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<FriendGiftPackage>>(
        `/api/friend-gift/packages?${buildQs({ cursor, limit, q })}`,
      ),
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

/** URL-driven friend-gift sends — admin audit log. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFriendGiftSends(route: any) {
  return useListSearch<FriendGiftSend>({
    route,
    queryKey: SENDS_KEY,
    filterDefs: FRIEND_GIFT_SEND_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<FriendGiftSend>>(
        `/api/friend-gift/sends?${buildQs({ cursor, limit, q })}`,
      ),
  })
}
