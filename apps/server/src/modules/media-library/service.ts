/**
 * Media library service — protocol-agnostic business logic for the
 * admin-side asset drive.
 *
 * Data model is adjacency-list folders plus flat asset rows. Uploads
 * land in an org-scoped default folder when callers omit `folderId`;
 * that folder is created lazily on first use.
 *
 * Object storage is abstracted behind the `ObjectStorage` interface —
 * the service never touches R2 or S3 directly, so swapping backends is
 * a config change in deps.ts.
 */

import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import type { ObjectStorage } from "../../lib/storage";
import { mediaAssets, mediaFolders } from "../../schema/media-library";
import { logger } from "../../lib/logger";
import {
  AssetNotFound,
  CannotDeleteDefaultFolder,
  FileTooLarge,
  FolderCycleDetected,
  FolderNameConflict,
  FolderNotEmpty,
  FolderNotFound,
  InvalidMimeType,
} from "./errors";
import {
  ALLOWED_MIME_TYPES,
  DEFAULT_FOLDER_NAME,
  MAX_UPLOAD_SIZE,
  type BreadcrumbEntry,
  type MediaAsset,
  type MediaFolder,
} from "./types";
import type {
  ConfirmUploadInput,
  CreateFolderInput,
  PresignUploadInput,
  UpdateFolderInput,
} from "./validators";

type MediaLibraryDeps = Pick<AppDeps, "db"> & {
  storage: ObjectStorage;
};

function pickExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  const ext = filename.slice(dot + 1).toLowerCase();
  // Strip anything weird; a-z0-9 only keeps object keys sane.
  return /^[a-z0-9]+$/.test(ext) ? ext : "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function generateObjectKey(organizationId: string, filename: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = pad2(now.getUTCMonth() + 1);
  const d = pad2(now.getUTCDate());
  const id = crypto.randomUUID();
  const ext = pickExtension(filename);
  return `${organizationId}/${y}/${m}/${d}/${id}${ext ? `.${ext}` : ""}`;
}

export function createMediaLibraryService(d: MediaLibraryDeps) {
  const { db, storage } = d;

  async function loadFolder(
    organizationId: string,
    id: string,
  ): Promise<MediaFolder> {
    const rows = await db
      .select()
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.id, id),
          eq(mediaFolders.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new FolderNotFound(id);
    return rows[0];
  }

  async function loadAsset(
    organizationId: string,
    id: string,
  ): Promise<MediaAsset> {
    const rows = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AssetNotFound(id);
    return rows[0];
  }

  /**
   * Walk up the parent chain to build breadcrumb entries in root→leaf
   * order. Hard-caps depth at 32 as a loop-breaker against corrupted
   * parent chains (shouldn't happen thanks to the self-FK + RESTRICT,
   * but defensive is cheap).
   */
  async function buildBreadcrumb(
    organizationId: string,
    folderId: string | null,
  ): Promise<BreadcrumbEntry[]> {
    if (!folderId) return [];
    const chain: BreadcrumbEntry[] = [];
    let currentId: string | null = folderId;
    for (let i = 0; i < 32 && currentId; i++) {
      const row: MediaFolder = await loadFolder(organizationId, currentId);
      chain.unshift({ id: row.id, name: row.name });
      currentId = row.parentId;
    }
    return chain;
  }

  async function ensureDefaultFolder(
    organizationId: string,
    createdBy: string | null,
  ): Promise<MediaFolder> {
    // Fast path: look up the existing default.
    const existing = await db
      .select()
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.organizationId, organizationId),
          eq(mediaFolders.isDefault, true),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    // Slow path: create it. The partial unique index on (orgId) WHERE
    // is_default=true guarantees at most one survives even under
    // concurrent inserts.
    try {
      const [row] = await db
        .insert(mediaFolders)
        .values({
          organizationId,
          parentId: null,
          name: DEFAULT_FOLDER_NAME,
          isDefault: true,
          createdBy,
        })
        .returning();
      if (!row) throw new Error("default folder insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Another request won the race — re-read and return.
        const rows = await db
          .select()
          .from(mediaFolders)
          .where(
            and(
              eq(mediaFolders.organizationId, organizationId),
              eq(mediaFolders.isDefault, true),
            ),
          )
          .limit(1);
        if (rows[0]) return rows[0];
      }
      throw err;
    }
  }

  /**
   * Return the set of descendant folder ids (inclusive of the start
   * folder). Used for move-into-own-subtree detection. Uses a recursive
   * CTE so we don't roundtrip once per level.
   */
  async function descendantFolderIds(
    organizationId: string,
    rootId: string,
  ): Promise<Set<string>> {
    const rows = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM ${mediaFolders}
          WHERE id = ${rootId} AND organization_id = ${organizationId}
        UNION ALL
        SELECT f.id FROM ${mediaFolders} f
          INNER JOIN descendants d ON f.parent_id = d.id
          WHERE f.organization_id = ${organizationId}
      )
      SELECT id FROM descendants
    `);
    const ids = new Set<string>();
    // drizzle's execute on neon-http returns { rows: [...] } or the
    // rows array directly depending on version. Handle both.
    const rowArr = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: { id: string }[] }).rows ?? []);
    for (const r of rowArr) ids.add(r.id);
    return ids;
  }

  return {
    // ─── Folders ─────────────────────────────────────────────────

    ensureDefaultFolder,

    async listFolders(
      organizationId: string,
      parentId: string | null,
    ): Promise<{ items: MediaFolder[]; breadcrumb: BreadcrumbEntry[] }> {
      const whereClause = parentId
        ? and(
            eq(mediaFolders.organizationId, organizationId),
            eq(mediaFolders.parentId, parentId),
          )
        : and(
            eq(mediaFolders.organizationId, organizationId),
            isNull(mediaFolders.parentId),
          );
      const items = await db
        .select()
        .from(mediaFolders)
        .where(whereClause)
        .orderBy(desc(mediaFolders.isDefault), asc(mediaFolders.name));
      const breadcrumb = await buildBreadcrumb(organizationId, parentId);
      return { items, breadcrumb };
    },

    async getFolder(
      organizationId: string,
      id: string,
    ): Promise<MediaFolder> {
      return loadFolder(organizationId, id);
    },

    async createFolder(
      organizationId: string,
      input: CreateFolderInput,
      createdBy: string | null,
    ): Promise<MediaFolder> {
      if (input.parentId) {
        await loadFolder(organizationId, input.parentId);
      }
      try {
        const [row] = await db
          .insert(mediaFolders)
          .values({
            organizationId,
            parentId: input.parentId ?? null,
            name: input.name,
            isDefault: false,
            createdBy,
          })
          .returning();
        if (!row) throw new Error("folder insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new FolderNameConflict(input.name);
        }
        throw err;
      }
    },

    async updateFolder(
      organizationId: string,
      id: string,
      input: UpdateFolderInput,
    ): Promise<MediaFolder> {
      const existing = await loadFolder(organizationId, id);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.parentId !== undefined) {
        if (input.parentId === id) throw new FolderCycleDetected();
        if (input.parentId) {
          await loadFolder(organizationId, input.parentId);
          const descendants = await descendantFolderIds(organizationId, id);
          if (descendants.has(input.parentId)) {
            throw new FolderCycleDetected();
          }
        }
        patch.parentId = input.parentId;
      }
      if (Object.keys(patch).length === 0) return existing;

      try {
        const [row] = await db
          .update(mediaFolders)
          .set(patch)
          .where(
            and(
              eq(mediaFolders.id, id),
              eq(mediaFolders.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new FolderNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && typeof input.name === "string") {
          throw new FolderNameConflict(input.name);
        }
        throw err;
      }
    },

    async deleteFolder(organizationId: string, id: string): Promise<void> {
      const folder = await loadFolder(organizationId, id);
      if (folder.isDefault) throw new CannotDeleteDefaultFolder();

      // Must be empty — no child folders and no assets.
      const [childCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(mediaFolders)
        .where(
          and(
            eq(mediaFolders.organizationId, organizationId),
            eq(mediaFolders.parentId, id),
          ),
        );
      if ((childCount?.n ?? 0) > 0) throw new FolderNotEmpty(id);

      const [assetCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.organizationId, organizationId),
            eq(mediaAssets.folderId, id),
          ),
        );
      if ((assetCount?.n ?? 0) > 0) throw new FolderNotEmpty(id);

      const deleted = await db
        .delete(mediaFolders)
        .where(
          and(
            eq(mediaFolders.id, id),
            eq(mediaFolders.organizationId, organizationId),
          ),
        )
        .returning({ id: mediaFolders.id });
      if (deleted.length === 0) throw new FolderNotFound(id);
    },

    // ─── Assets ──────────────────────────────────────────────────

    async listAssets(
      organizationId: string,
      folderId: string | null,
      opts: { limit?: number; cursor?: string } = {},
    ): Promise<{ items: MediaAsset[]; nextCursor: string | null }> {
      const effectiveFolderId =
        folderId ?? (await ensureDefaultFolder(organizationId, null)).id;
      // Verify the folder exists in this org; prevents cross-tenant
      // probing via a guessed folder id.
      await loadFolder(organizationId, effectiveFolderId);

      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      const conds = [
        eq(mediaAssets.organizationId, organizationId),
        eq(mediaAssets.folderId, effectiveFolderId),
      ];
      if (opts.cursor) {
        const c = new Date(opts.cursor);
        if (!Number.isNaN(c.getTime())) {
          conds.push(lt(mediaAssets.createdAt, c));
        }
      }
      const rows = await db
        .select()
        .from(mediaAssets)
        .where(and(...conds))
        .orderBy(desc(mediaAssets.createdAt))
        .limit(limit + 1);

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows[limit - 1]!;
        nextCursor = last.createdAt.toISOString();
        rows.length = limit;
      }
      return { items: rows, nextCursor };
    },

    async getAsset(organizationId: string, id: string): Promise<MediaAsset> {
      return loadAsset(organizationId, id);
    },

    /**
     * Worker-mediated upload: accepts the full file in memory, writes
     * it to object storage, then inserts the DB row. Used by the admin
     * FormData upload route.
     */
    async uploadAsset(input: {
      organizationId: string;
      folderId: string | null;
      filename: string;
      mimeType: string;
      body: Uint8Array;
      uploadedBy: string | null;
    }): Promise<MediaAsset> {
      const { organizationId, filename, mimeType, body, uploadedBy } = input;
      if (
        !ALLOWED_MIME_TYPES.includes(
          mimeType as (typeof ALLOWED_MIME_TYPES)[number],
        )
      ) {
        throw new InvalidMimeType(mimeType);
      }
      if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_SIZE) {
        throw new FileTooLarge(body.byteLength, MAX_UPLOAD_SIZE);
      }

      const folder = input.folderId
        ? await loadFolder(organizationId, input.folderId)
        : await ensureDefaultFolder(organizationId, uploadedBy);

      const objectKey = generateObjectKey(organizationId, filename);
      // Storage write first — if DB insert then fails we orphan one
      // object in the bucket. That's acceptable (trivial to GC) and
      // strictly better than the opposite ordering, which would risk
      // exposing a DB row that points at missing storage.
      await storage.put(objectKey, body, { contentType: mimeType });

      const [row] = await db
        .insert(mediaAssets)
        .values({
          organizationId,
          folderId: folder.id,
          objectKey,
          filename,
          mimeType,
          size: body.byteLength,
          uploadedBy,
        })
        .returning();
      if (!row) {
        // DB insert failed after storage write — clean up the orphan.
        await storage.delete(objectKey).catch(() => undefined);
        throw new Error("asset insert returned no row");
      }
      return row;
    },

    /**
     * Presigned upload flow step 1: reserve a DB row, hand back the
     * pre-signed PUT URL. Row is valid immediately; if the caller
     * never uploads, the row still exists — GC can prune rows whose
     * HEAD comes back 404 from storage.
     *
     * For the admin first version we don't wire this into the UI;
     * kept available so future large-file / direct-upload flows have
     * a server endpoint to call.
     */
    async presignUpload(input: {
      organizationId: string;
      uploadedBy: string | null;
      request: PresignUploadInput;
    }): Promise<{
      asset: MediaAsset;
      objectKey: string;
      uploadUrl: string;
      publicUrl: string;
      expiresIn: number;
    }> {
      const { organizationId, uploadedBy, request } = input;
      if (
        !ALLOWED_MIME_TYPES.includes(
          request.mimeType as (typeof ALLOWED_MIME_TYPES)[number],
        )
      ) {
        throw new InvalidMimeType(request.mimeType);
      }
      if (request.size > MAX_UPLOAD_SIZE) {
        throw new FileTooLarge(request.size, MAX_UPLOAD_SIZE);
      }

      const folder = request.folderId
        ? await loadFolder(organizationId, request.folderId)
        : await ensureDefaultFolder(organizationId, uploadedBy);

      const objectKey = generateObjectKey(organizationId, request.filename);
      const expiresIn = 15 * 60;
      const uploadUrl = await storage.getPresignedPutUrl(objectKey, {
        contentType: request.mimeType,
        expiresIn,
      });
      const publicUrl = storage.getPublicUrl(objectKey);

      const [row] = await db
        .insert(mediaAssets)
        .values({
          organizationId,
          folderId: folder.id,
          objectKey,
          filename: request.filename,
          mimeType: request.mimeType,
          size: request.size,
          uploadedBy,
        })
        .returning();
      if (!row) throw new Error("asset insert returned no row");
      return { asset: row, objectKey, uploadUrl, publicUrl, expiresIn };
    },

    /**
     * Presigned upload flow step 2: called by the client after a
     * successful direct upload to confirm actual size/checksum/dimensions.
     * Idempotent — callers can retry safely.
     */
    async confirmUpload(
      organizationId: string,
      input: ConfirmUploadInput,
    ): Promise<MediaAsset> {
      const asset = await loadAsset(organizationId, input.assetId);
      const patch: Record<string, unknown> = {};
      if (input.size !== undefined) patch.size = input.size;
      if (input.width !== undefined) patch.width = input.width;
      if (input.height !== undefined) patch.height = input.height;
      if (input.checksum !== undefined) patch.checksum = input.checksum;
      if (Object.keys(patch).length === 0) return asset;
      const [row] = await db
        .update(mediaAssets)
        .set(patch)
        .where(
          and(
            eq(mediaAssets.id, input.assetId),
            eq(mediaAssets.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new AssetNotFound(input.assetId);
      return row;
    },

    async deleteAsset(organizationId: string, id: string): Promise<void> {
      const asset = await loadAsset(organizationId, id);
      // Delete DB row first so a second request can't hand out a URL
      // that points at a deleted object. Storage delete is best-effort;
      // if it fails the row is already gone so GC can mop up later.
      await db
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, id),
            eq(mediaAssets.organizationId, organizationId),
          ),
        );
      try {
        await storage.delete(asset.objectKey);
      } catch (err) {
        logger.error(
          `media-library: failed to delete object ${asset.objectKey}`,
          err,
        );
      }
    },

    /** Stream an object through the Worker for the fallback proxy route. */
    async streamObject(objectKey: string) {
      return storage.get(objectKey);
    },

    /** Compose a public URL for a given object key. */
    publicUrl(objectKey: string): string {
      return storage.getPublicUrl(objectKey);
    },
  };
}

export type MediaLibraryService = ReturnType<typeof createMediaLibraryService>;
