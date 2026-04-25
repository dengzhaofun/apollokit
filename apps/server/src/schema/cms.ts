import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * Generic CMS — schema-driven content management.
 *
 * Two tables form the abstraction:
 *
 *   cms_types    — runtime-defined content types. The `schema` jsonb column
 *                  holds a CmsSchemaDef DSL describing the fields, validation
 *                  rules, and UI hints for entries of this type.
 *
 *   cms_entries  — actual content rows. The `data` jsonb column is validated
 *                  against the owning type's schema at write time.
 *
 * Operators define new types in the admin UI without a deploy. Game / business
 * clients fetch published entries by `alias`, `group_key`, or `tags` via the
 * client routes (cpk_ + HMAC). Schema evolution is constrained at the UI
 * layer to additive-only (new optional fields) so old entries keep validating.
 *
 * `schemaVersion` on each entry is the type.schemaVersion at the time of
 * write — admin reads compare to current and surface a "schema upgraded"
 * hint, but client reads are version-blind (clients just read whatever
 * `data` holds).
 *
 * The `tagsGin` index uses a Postgres GIN index on the array column so
 * `tags && '{"welcome"}'::text[]` lookups stay fast at million-row scale.
 */
export type CmsTypeStatus = "active" | "archived";
export type CmsEntryStatus = "draft" | "published" | "archived";

export const cmsTypes = pgTable(
  "cms_types",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    /**
     * Field DSL. See `modules/cms/types.ts` (`CmsSchemaDef`).
     * Stored as jsonb so we can index into it server-side if needed.
     */
    schema: jsonb("schema").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    /**
     * Optional whitelist of valid `group_key` values for entries of this
     * type. Empty / null → any string allowed. Non-empty → admin form
     * shows a select limited to these.
     */
    groupOptions: text("group_options").array(),
    status: text("status").$type<CmsTypeStatus>().notNull().default("active"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("cms_types_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("cms_types_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const cmsEntries = pgTable(
  "cms_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    typeId: uuid("type_id")
      .notNull()
      .references(() => cmsTypes.id, { onDelete: "cascade" }),
    /**
     * Denormalized copy of `cms_types.alias` so client-route lookups
     * (`/api/client/cms/by-alias/{typeAlias}/{entryAlias}`) can hit a
     * single table without a join. Kept in sync by the service layer.
     */
    typeAlias: text("type_alias").notNull(),
    alias: text("alias").notNull(),
    groupKey: text("group_key"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * The entry payload, validated against the owning type's schema at
     * write time. Stored as jsonb so client routes can return it as-is.
     */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<CmsEntryStatus>().notNull().default("draft"),
    publishedAt: timestamp("published_at"),
    /**
     * Snapshot of `cms_types.schemaVersion` at write time. Reads compare
     * to current to surface a "schema upgraded" hint in the admin UI.
     */
    schemaVersion: integer("schema_version").notNull(),
    /**
     * Optimistic-concurrency token. neon-http forbids `db.transaction()`
     * so writes use `UPDATE … WHERE version = ?` to detect lost updates.
     */
    version: integer("version").notNull().default(1),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // alias unique within (org, type)
    uniqueIndex("cms_entries_org_type_alias_uidx").on(
      table.organizationId,
      table.typeAlias,
      table.alias,
    ),
    // client-route: list-by-group
    index("cms_entries_org_type_group_status_idx").on(
      table.organizationId,
      table.typeAlias,
      table.groupKey,
      table.status,
    ),
    // client-route: list-by-tag — GIN on array column for `&&` / `@>` operators
    index("cms_entries_tags_gin").using("gin", table.tags),
    // admin list pagination
    index("cms_entries_org_type_updated_idx").on(
      table.organizationId,
      table.typeId,
      table.updatedAt,
    ),
  ],
);
