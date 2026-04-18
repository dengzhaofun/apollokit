export interface MediaFolder {
  id: string
  organizationId: string
  parentId: string | null
  name: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface BreadcrumbEntry {
  id: string
  name: string
}

export interface MediaAsset {
  id: string
  organizationId: string
  folderId: string
  objectKey: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  checksum: string | null
  /**
   * Resolved public URL assembled by the server based on
   * MEDIA_PUBLIC_URL_BASE. May be a relative path (`/api/media-library/
   * object/...`) when no CDN is configured — the admin api-client
   * prepends VITE_AUTH_SERVER_URL for those.
   */
  url: string
  createdAt: string
}

export interface MediaFolderListResponse {
  items: MediaFolder[]
  breadcrumb: BreadcrumbEntry[]
}

export interface MediaAssetListResponse {
  items: MediaAsset[]
  nextCursor: string | null
}

export interface CreateMediaFolderInput {
  name: string
  parentId?: string | null
}

export interface UpdateMediaFolderInput {
  name?: string
  parentId?: string | null
}
