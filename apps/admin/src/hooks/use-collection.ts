import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  AlbumListResponse,
  CollectionAlbum,
  CollectionEntry,
  CollectionGroup,
  CollectionMilestone,
  CollectionStats,
  CreateAlbumInput,
  CreateEntryInput,
  CreateGroupInput,
  CreateMilestoneInput,
  EntryListResponse,
  GroupListResponse,
  MilestoneListResponse,
  UpdateAlbumInput,
  UpdateEntryInput,
  UpdateGroupInput,
  UpdateMilestoneInput,
} from "#/lib/types/collection"

const ALBUMS_KEY = ["collection-albums"] as const
const albumKey = (key: string) => ["collection-album", key] as const
const groupsKey = (albumKey: string) =>
  ["collection-album", albumKey, "groups"] as const
const entriesKey = (albumKey: string) =>
  ["collection-album", albumKey, "entries"] as const
const milestonesKey = (albumKey: string) =>
  ["collection-album", albumKey, "milestones"] as const
const statsKey = (albumKey: string) =>
  ["collection-album", albumKey, "stats"] as const

// ─── Albums ───────────────────────────────────────────────────────

export function useCollectionAlbums() {
  return useQuery({
    queryKey: ALBUMS_KEY,
    queryFn: () => api.get<AlbumListResponse>("/api/v1/collection/albums"),
    select: (data) => data.items,
  })
}

export function useCollectionAlbum(key: string) {
  return useQuery({
    queryKey: albumKey(key),
    queryFn: () =>
      api.get<CollectionAlbum>(`/api/v1/collection/albums/${key}`),
    enabled: !!key,
  })
}

export function useCreateCollectionAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAlbumInput) =>
      api.post<CollectionAlbum>("/api/v1/collection/albums", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALBUMS_KEY }),
  })
}

export function useUpdateCollectionAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAlbumInput }) =>
      api.patch<CollectionAlbum>(`/api/v1/collection/albums/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: ALBUMS_KEY })
      qc.invalidateQueries({ queryKey: albumKey(vars.id) })
    },
  })
}

export function useDeleteCollectionAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/collection/albums/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALBUMS_KEY }),
  })
}

// ─── Groups ───────────────────────────────────────────────────────

export function useCollectionGroups(albumKeyStr: string) {
  return useQuery({
    queryKey: groupsKey(albumKeyStr),
    queryFn: () =>
      api.get<GroupListResponse>(
        `/api/v1/collection/albums/${albumKeyStr}/groups`,
      ),
    select: (data) => data.items,
    enabled: !!albumKeyStr,
  })
}

export function useCreateCollectionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      albumKey,
      input,
    }: {
      albumKey: string
      input: CreateGroupInput
    }) =>
      api.post<CollectionGroup>(
        `/api/v1/collection/albums/${albumKey}/groups`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: groupsKey(vars.albumKey) })
    },
  })
}

export function useUpdateCollectionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      albumKey: string
      input: UpdateGroupInput
    }) => api.patch<CollectionGroup>(`/api/v1/collection/groups/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: groupsKey(vars.albumKey) })
    },
  })
}

export function useDeleteCollectionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; albumKey: string }) =>
      api.delete(`/api/v1/collection/groups/${id}`),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: groupsKey(vars.albumKey) })
      qc.invalidateQueries({ queryKey: entriesKey(vars.albumKey) })
    },
  })
}

// ─── Entries ──────────────────────────────────────────────────────

export function useCollectionEntries(albumKeyStr: string) {
  return useQuery({
    queryKey: entriesKey(albumKeyStr),
    queryFn: () =>
      api.get<EntryListResponse>(
        `/api/v1/collection/albums/${albumKeyStr}/entries`,
      ),
    select: (data) => data.items,
    enabled: !!albumKeyStr,
  })
}

export function useCreateCollectionEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      albumKey,
      input,
    }: {
      albumKey: string
      input: CreateEntryInput
    }) =>
      api.post<CollectionEntry>(
        `/api/v1/collection/albums/${albumKey}/entries`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: entriesKey(vars.albumKey) })
    },
  })
}

export function useUpdateCollectionEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      albumKey: string
      input: UpdateEntryInput
    }) =>
      api.patch<CollectionEntry>(`/api/v1/collection/entries/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: entriesKey(vars.albumKey) })
    },
  })
}

export function useDeleteCollectionEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; albumKey: string }) =>
      api.delete(`/api/v1/collection/entries/${id}`),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: entriesKey(vars.albumKey) })
    },
  })
}

// ─── Milestones ───────────────────────────────────────────────────

export function useCollectionMilestones(albumKeyStr: string) {
  return useQuery({
    queryKey: milestonesKey(albumKeyStr),
    queryFn: () =>
      api.get<MilestoneListResponse>(
        `/api/v1/collection/albums/${albumKeyStr}/milestones`,
      ),
    select: (data) => data.items,
    enabled: !!albumKeyStr,
  })
}

export function useCreateCollectionMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      albumKey,
      input,
    }: {
      albumKey: string
      input: CreateMilestoneInput
    }) =>
      api.post<CollectionMilestone>(
        `/api/v1/collection/albums/${albumKey}/milestones`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: milestonesKey(vars.albumKey) })
    },
  })
}

export function useUpdateCollectionMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      albumKey: string
      input: UpdateMilestoneInput
    }) =>
      api.patch<CollectionMilestone>(
        `/api/v1/collection/milestones/${id}`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: milestonesKey(vars.albumKey) })
    },
  })
}

export function useDeleteCollectionMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; albumKey: string }) =>
      api.delete(`/api/v1/collection/milestones/${id}`),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: milestonesKey(vars.albumKey) })
    },
  })
}

// ─── Stats + rescan ───────────────────────────────────────────────

export function useCollectionStats(albumKeyStr: string) {
  return useQuery({
    queryKey: statsKey(albumKeyStr),
    queryFn: () =>
      api.get<CollectionStats>(
        `/api/v1/collection/albums/${albumKeyStr}/stats`,
      ),
    enabled: !!albumKeyStr,
  })
}

export function useCollectionRescan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      albumKey,
      endUserId,
    }: {
      albumKey: string
      endUserId: string
    }) =>
      api.post<{ unlocked: string[] }>(
        `/api/v1/collection/albums/${albumKey}/rescan`,
        { endUserId },
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: statsKey(vars.albumKey) })
    },
  })
}
