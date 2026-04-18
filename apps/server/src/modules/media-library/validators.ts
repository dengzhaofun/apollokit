import { z } from "@hono/zod-openapi";

import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE } from "./types";

// ─── Folder schemas ────────────────────────────────────────────

export const CreateFolderSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(128)
      .refine((s) => !/[\\/]/.test(s), {
        message: "folder name cannot contain slashes",
      }),
    parentId: z.string().uuid().nullable().optional(),
  })
  .openapi("MediaFolderCreateRequest");

export const UpdateFolderSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(128)
      .refine((s) => !/[\\/]/.test(s), {
        message: "folder name cannot contain slashes",
      })
      .optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .openapi("MediaFolderUpdateRequest");

export type CreateFolderInput = z.input<typeof CreateFolderSchema>;
export type UpdateFolderInput = z.input<typeof UpdateFolderSchema>;

// ─── Asset schemas ─────────────────────────────────────────────

export const PresignUploadSchema = z
  .object({
    filename: z.string().min(1).max(256),
    mimeType: z.enum(ALLOWED_MIME_TYPES),
    size: z.number().int().min(1).max(MAX_UPLOAD_SIZE),
    folderId: z.string().uuid().nullable().optional(),
  })
  .openapi("MediaAssetPresignRequest");

export const ConfirmUploadSchema = z
  .object({
    assetId: z.string().uuid(),
    size: z.number().int().min(1).max(MAX_UPLOAD_SIZE).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    checksum: z.string().max(128).optional(),
  })
  .openapi("MediaAssetConfirmRequest");

export type PresignUploadInput = z.input<typeof PresignUploadSchema>;
export type ConfirmUploadInput = z.input<typeof ConfirmUploadSchema>;

// ─── Path params ───────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});

// ─── Query schemas ─────────────────────────────────────────────

export const ListFoldersQuerySchema = z.object({
  parentId: z.string().uuid().optional().openapi({
    param: { name: "parentId", in: "query" },
    description: "List folders directly under this parent. Omit for root.",
  }),
});

export const ListAssetsQuerySchema = z.object({
  folderId: z.string().uuid().optional().openapi({
    param: { name: "folderId", in: "query" },
    description:
      "List assets in this folder. Omit to list the default upload folder's contents.",
  }),
  limit: z.coerce.number().int().min(1).max(200).optional().openapi({
    param: { name: "limit", in: "query" },
  }),
  cursor: z.string().datetime().optional().openapi({
    param: { name: "cursor", in: "query" },
    description: "ISO timestamp from the previous page's last item.",
  }),
});

// ─── Response schemas ──────────────────────────────────────────

export const FolderResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("MediaFolder");

export const FolderListResponseSchema = z
  .object({
    items: z.array(FolderResponseSchema),
    breadcrumb: z.array(
      z.object({ id: z.string(), name: z.string() }),
    ),
  })
  .openapi("MediaFolderList");

export const AssetResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    folderId: z.string(),
    objectKey: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    checksum: z.string().nullable(),
    url: z.string(),
    createdAt: z.string(),
  })
  .openapi("MediaAsset");

export const AssetListResponseSchema = z
  .object({
    items: z.array(AssetResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("MediaAssetList");

export const PresignUploadResponseSchema = z
  .object({
    assetId: z.string(),
    objectKey: z.string(),
    uploadUrl: z.string(),
    publicUrl: z.string(),
    /** Seconds until uploadUrl expires. */
    expiresIn: z.number(),
  })
  .openapi("MediaAssetPresignResponse");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("MediaLibraryErrorResponse");
