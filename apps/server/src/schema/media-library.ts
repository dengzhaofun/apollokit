import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * Media library folders — adjacency list (parentId self-FK).
 *
 * We deliberately DO NOT store a materialized `path` column. Folder
 * counts per-org are expected to stay small (hundreds at most) and the
 * only listing query is `WHERE parent_id = ?` which is adjacency-native.
 * Breadcrumb rendering walks the parent chain in the service layer
 * (≤ 5 levels in practice).
 *
 * `isDefault = true` marks the organization-scoped default upload
 * folder. It's lazy-created on first upload when the caller omits
 * folderId — we use a partial unique index to keep "at most one default
 * per org" as a hard invariant.
 */
export const mediaFolders = pgTable(
  "media_folders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Null parent means "root of this org's drive". The self-FK uses
    // ON DELETE RESTRICT so a parent folder can't be dropped while it
    // still has children — the service layer enforces "must be empty"
    // before a delete, this is the belt-and-suspenders DB catch.
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => mediaFolders.id,
      { onDelete: "restrict" },
    ),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("media_folders_org_parent_idx").on(
      table.organizationId,
      table.parentId,
    ),
    // Sibling names are unique within a parent. NULL values compare
    // as distinct in Postgres so we get two separate constraints:
    // one for sibling folders under a real parent, one for root-level
    // folders (parent_id IS NULL). We express both via partial indexes.
    uniqueIndex("media_folders_name_under_parent_uidx")
      .on(table.organizationId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL`),
    uniqueIndex("media_folders_name_at_root_uidx")
      .on(table.organizationId, table.name)
      .where(sql`${table.parentId} IS NULL`),
    // At most one default folder per org.
    uniqueIndex("media_folders_org_default_uidx")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true`),
  ],
);

/**
 * Media library assets — one row per uploaded object.
 *
 * `objectKey` is the canonical R2 / S3 key (e.g. `{orgId}/2026/04/18/
 * {uuid}.png`). It is internal; clients fetch the asset via
 * `objectStorage.getPublicUrl(key)` assembled at read time. Never store
 * a public URL in the DB — it couples the schema to the current CDN
 * domain and makes migrating buckets painful.
 *
 * `size` is bigint because S3 allows 5 TB objects, even though our
 * admin uploads are typically <10 MB.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => mediaFolders.id, { onDelete: "restrict" }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum"),
    uploadedBy: text("uploaded_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("media_assets_org_folder_created_idx").on(
      table.organizationId,
      table.folderId,
      table.createdAt,
    ),
    // Object keys are globally unique by construction (orgId + uuid);
    // a unique index makes accidental key collisions a hard error
    // instead of silent overwrite.
    uniqueIndex("media_assets_object_key_uidx").on(table.objectKey),
  ],
);
