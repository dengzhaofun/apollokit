import type { mediaAssets, mediaFolders } from "../../schema/media-library";

export type MediaFolder = typeof mediaFolders.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;

/** MIME types that admin upload accepts. Keep conservative; expand on demand. */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export const DEFAULT_FOLDER_NAME = "默认上传";

/** Breadcrumb entry returned alongside folder listings. */
export interface BreadcrumbEntry {
  id: string;
  name: string;
}
