/**
 * Admin-facing HTTP routes for the media library module.
 *
 * Mounted under `/api/media-library` and guarded by
 * `requireAdminOrApiKey`. One exception: the `/object/:key` fallback
 * proxy is registered without the guard so browsers can load images via
 * `<img src=...>` when `MEDIA_PUBLIC_URL_BASE` is not configured.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { mediaLibraryService } from "./index";
import type { MediaAsset, MediaFolder } from "./types";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE } from "./types";
import {
  AssetListResponseSchema,
  AssetResponseSchema,
  ConfirmUploadSchema,
  CreateFolderSchema,
  ErrorResponseSchema,
  FolderListResponseSchema,
  FolderResponseSchema,
  IdParamSchema,
  ListAssetsQuerySchema,
  ListFoldersQuerySchema,
  PresignUploadResponseSchema,
  PresignUploadSchema,
  UpdateFolderSchema,
} from "./validators";
import {
  FileTooLarge,
  InvalidMimeType,
} from "./errors";

const TAG = "Media Library (Admin)";

function serializeFolder(row: MediaFolder) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAsset(row: MediaAsset) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    folderId: row.folderId,
    objectKey: row.objectKey,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    checksum: row.checksum,
    url: mediaLibraryService.publicUrl(row.objectKey),
    createdAt: row.createdAt.toISOString(),
  };
}

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const mediaLibraryRouter = createAdminRouter();

// ─── Public-ish proxy route (no auth) ──────────────────────────
//
// Registered BEFORE the admin guard so image `<img src>` requests from
// browsers can fetch objects without carrying auth cookies. When the
// deployer configures MEDIA_PUBLIC_URL_BASE (R2 custom domain / r2.dev),
// asset URLs skip this route entirely.
mediaLibraryRouter.get("/object/*", async (c) => {
  const prefix = "/object/";
  const pathname = new URL(c.req.url).pathname;
  const idx = pathname.indexOf(prefix);
  if (idx === -1) return c.body(null, 404);
  const encoded = pathname.slice(idx + prefix.length);
  const key = decodeURIComponent(encoded);
  if (!key) return c.body(null, 404);
  const obj = await mediaLibraryService.streamObject(key);
  if (!obj) return c.body(null, 404);
  const headers: Record<string, string> = {
    "cache-control": "public, max-age=300",
  };
  if (obj.contentType) headers["content-type"] = obj.contentType;
  if (obj.size > 0) headers["content-length"] = String(obj.size);
  return new Response(obj.body, { headers });
});

// ─── Guarded admin routes ──────────────────────────────────────

mediaLibraryRouter.use("*", requireAdminOrApiKey);

mediaLibraryRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

// ─── Folders ───────────────────────────────────────────────────

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/folders",
    tags: [TAG],
    summary: "List folders under a parent (omit parentId for root)",
    request: { query: ListFoldersQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FolderListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { parentId } = c.req.valid("query");
    const { items, breadcrumb } = await mediaLibraryService.listFolders(
      orgId,
      parentId ?? null,
    );
    return c.json(
      { items: items.map(serializeFolder), breadcrumb },
      200,
    );
  },
);

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/folders",
    tags: [TAG],
    summary: "Create a new folder",
    request: {
      body: {
        content: { "application/json": { schema: CreateFolderSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: FolderResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const createdBy = c.var.user?.id ?? null;
    const row = await mediaLibraryService.createFolder(orgId, input, createdBy);
    return c.json(serializeFolder(row), 201);
  },
);

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/folders/{id}",
    tags: [TAG],
    summary: "Rename or move a folder",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateFolderSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: FolderResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await mediaLibraryService.updateFolder(orgId, id, input);
    return c.json(serializeFolder(row), 200);
  },
);

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/folders/{id}",
    tags: [TAG],
    summary: "Delete an empty folder",
    request: { params: IdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mediaLibraryService.deleteFolder(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Assets ────────────────────────────────────────────────────

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/assets",
    tags: [TAG],
    summary: "List assets in a folder",
    request: { query: ListAssetsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AssetListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { folderId, limit, cursor } = c.req.valid("query");
    const { items, nextCursor } = await mediaLibraryService.listAssets(
      orgId,
      folderId ?? null,
      { limit, cursor },
    );
    return c.json({ items: items.map(serializeAsset), nextCursor }, 200);
  },
);

// Multipart upload route — handwired (OpenAPIHono's multipart support is
// rough). We parse FormData ourselves and call the service.
mediaLibraryRouter.post("/assets/upload", async (c) => {
  const orgId = c.var.session!.activeOrganizationId!;
  const uploadedBy = c.var.user?.id ?? null;

  const form = await c.req.formData();
  const file = form.get("file");
  const folderIdRaw = form.get("folderId");
  const folderId =
    typeof folderIdRaw === "string" && folderIdRaw.length > 0
      ? folderIdRaw
      : null;

  if (!(file instanceof File)) {
    return c.json(
      { error: "field 'file' is required and must be a file", requestId: c.get("requestId") },
      400,
    );
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new FileTooLarge(file.size, MAX_UPLOAD_SIZE);
  }
  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number],
    )
  ) {
    throw new InvalidMimeType(file.type || "application/octet-stream");
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const asset = await mediaLibraryService.uploadAsset({
    organizationId: orgId,
    folderId,
    filename: file.name,
    mimeType: file.type,
    body: buf,
    uploadedBy,
  });
  return c.json(serializeAsset(asset), 201);
});

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/assets/presign",
    tags: [TAG],
    summary:
      "Reserve a DB row and return a pre-signed PUT URL for direct browser upload",
    request: {
      body: {
        content: { "application/json": { schema: PresignUploadSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: PresignUploadResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const uploadedBy = c.var.user?.id ?? null;
    const request = c.req.valid("json");
    const { asset, objectKey, uploadUrl, publicUrl, expiresIn } =
      await mediaLibraryService.presignUpload({
        organizationId: orgId,
        uploadedBy,
        request,
      });
    return c.json(
      {
        assetId: asset.id,
        objectKey,
        uploadUrl,
        publicUrl,
        expiresIn,
      },
      200,
    );
  },
);

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/assets/confirm",
    tags: [TAG],
    summary: "Finalize a pre-signed upload with actual size/checksum",
    request: {
      body: {
        content: { "application/json": { schema: ConfirmUploadSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AssetResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await mediaLibraryService.confirmUpload(orgId, input);
    return c.json(serializeAsset(row), 200);
  },
);

mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/assets/{id}",
    tags: [TAG],
    summary: "Delete an asset (and its backing object)",
    request: { params: IdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mediaLibraryService.deleteAsset(orgId, id);
    return c.body(null, 204);
  },
);

// OpenAPI doc — hand-register the multipart route so it shows up in
// `/openapi.json` without going through zod-openapi's multipart machinery.
mediaLibraryRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/assets/upload",
    tags: [TAG],
    summary:
      "Worker-mediated upload (multipart/form-data; file, folderId?)",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.string().openapi({ format: "binary" }),
              folderId: z.string().uuid().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: AssetResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  // The above `mediaLibraryRouter.post("/assets/upload", …)` handles the
  // real request; this openapi shim registers the doc but never runs.
  () => new Response("never reached", { status: 500 }) as never,
);
