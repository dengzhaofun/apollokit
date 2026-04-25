/**
 * Domain types for the CMS module.
 *
 * The runtime-defined "schema" of a content type is captured as a
 * `CmsSchemaDef` — an array of `CmsFieldDef` field definitions plus
 * top-level metadata. The schema lives in `cms_types.schema` (jsonb)
 * and gets converted to a Zod schema at request time by
 * `schema-validator.ts` for validating `cms_entries.data` writes.
 *
 * Why not JSON Schema? JSON Schema's vocabulary lacks first-class
 * concepts for `label / description / image / entryRef / refTypeAlias`
 * and gives unfriendly default error messages. We define a tighter DSL
 * that maps cleanly to both Postgres (jsonb storage) and Zod (runtime
 * validation) without an intermediate format.
 */

import type { cmsEntries, cmsTypes } from "../../schema/cms";

export type CmsType = typeof cmsTypes.$inferSelect;
export type CmsEntry = typeof cmsEntries.$inferSelect;

export const CMS_FIELD_TYPES = [
  "text",
  "textarea",
  "markdown",
  "number",
  "boolean",
  "date",
  "datetime",
  "select",
  "multiselect",
  "image",
  "entryRef",
  "array",
  "object",
  "json",
] as const;
export type CmsFieldType = (typeof CMS_FIELD_TYPES)[number];

export type CmsEnumOption = {
  value: string;
  label: string;
};

export type CmsFieldValidation = {
  /** number / array length lower bound */
  min?: number;
  /** number / array length upper bound */
  max?: number;
  /** string min length */
  minLength?: number;
  /** string max length */
  maxLength?: number;
  /** string regex (anchored) */
  pattern?: string;
  /** select / multiselect options */
  enum?: CmsEnumOption[];
};

export type CmsFieldOptions = {
  placeholder?: string;
  /** textarea/markdown rows hint for the UI */
  rows?: number;
  /** entryRef: limit to this typeAlias */
  refTypeAlias?: string;
  /** image: allowed MIME types */
  accept?: string[];
};

export type CmsFieldDef = {
  /** machine name, must be a valid JS identifier-ish string */
  name: string;
  label: string;
  description?: string;
  type: CmsFieldType;
  required?: boolean;
  /**
   * Field default. Stored verbatim — caller is responsible for shape.
   */
  default?: unknown;
  validation?: CmsFieldValidation;
  /** Required when `type === "array"`. Item-level definition. */
  itemDef?: CmsFieldDef;
  /** Required when `type === "object"`. Recursive nested fields. */
  fields?: CmsFieldDef[];
  options?: CmsFieldOptions;
};

export type CmsSchemaDef = {
  fields: CmsFieldDef[];
};

/**
 * Concrete shape of an `image` field value.
 * `mediaId` references the future media-library row; for v1 we accept
 * any non-empty string so the existing media-library integration can
 * be wired in M4 without a schema migration.
 */
export type CmsImageRef = {
  mediaId: string;
  alt?: string;
};

/**
 * Concrete shape of an `entryRef` field value. Stores typeAlias + alias
 * (not raw uuid) so cross-environment references stay portable.
 */
export type CmsEntryRef = {
  typeAlias: string;
  alias: string;
};
