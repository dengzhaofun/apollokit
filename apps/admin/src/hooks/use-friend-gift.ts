import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
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

export function useFriendGiftPackages() {
  return useQuery({
    queryKey: PACKAGES_KEY,
    queryFn: () =>
      api.get<{ items: FriendGiftPackage[] }>("/api/friend-gift/packages"),
    select: (data) => data.items,
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

export function useFriendGiftSends() {
  return useQuery({
    queryKey: SENDS_KEY,
    queryFn: () =>
      api.get<{ items: FriendGiftSend[] }>("/api/friend-gift/sends"),
    select: (data) => data.items,
  })
}
