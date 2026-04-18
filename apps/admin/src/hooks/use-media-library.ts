import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateMediaFolderInput,
  MediaAsset,
  MediaAssetListResponse,
  MediaFolder,
  MediaFolderListResponse,
  UpdateMediaFolderInput,
} from "#/lib/types/media-library"

const FOLDERS_KEY = ["media-library", "folders"] as const
const ASSETS_KEY = ["media-library", "assets"] as const

// ─── Folders ────────────────────────────────────────────────────

export function useMediaFolders(parentId: string | null | undefined) {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""
  return useQuery({
    queryKey: [...FOLDERS_KEY, parentId ?? null],
    queryFn: () =>
      api.get<MediaFolderListResponse>(`/api/media-library/folders${qs}`),
  })
}

export function useCreateMediaFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMediaFolderInput) =>
      api.post<MediaFolder>("/api/media-library/folders", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  })
}

export function useUpdateMediaFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateMediaFolderInput
    }) => api.patch<MediaFolder>(`/api/media-library/folders/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  })
}

export function useDeleteMediaFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/media-library/folders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  })
}

// ─── Assets ─────────────────────────────────────────────────────

export function useMediaAssets(folderId: string | null | undefined) {
  const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""
  return useQuery({
    queryKey: [...ASSETS_KEY, folderId ?? null],
    queryFn: () =>
      api.get<MediaAssetListResponse>(`/api/media-library/assets${qs}`),
  })
}

export interface UploadAssetVariables {
  file: File
  folderId?: string | null
}

export function useUploadMediaAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, folderId }: UploadAssetVariables) => {
      const form = new FormData()
      form.append("file", file)
      if (folderId) form.append("folderId", folderId)
      return api.upload<MediaAsset>("/api/media-library/assets/upload", form)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

export function useDeleteMediaAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/media-library/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}
