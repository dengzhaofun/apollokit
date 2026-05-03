/**
 * Frontend types mirroring the server CMS module.
 *
 * Source of truth lives in `apps/server/src/modules/cms/types.ts` and
 * `apps/server/src/schema/cms.ts`. Kept in sync by hand for now; once
 * the SDK regen pipeline is wired up these can be re-exported from
 * the generated client.
 */

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
] as const
export type CmsFieldType = (typeof CMS_FIELD_TYPES)[number]

export type CmsEnumOption = {
  value: string
  label: string
}

export type CmsFieldValidation = {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  enum?: CmsEnumOption[]
}

export type CmsFieldOptions = {
  placeholder?: string
  rows?: number
  refTypeAlias?: string
  accept?: string[]
}

export type CmsFieldDef = {
  name: string
  label: string
  description?: string
  type: CmsFieldType
  required?: boolean
  default?: unknown
  validation?: CmsFieldValidation
  itemDef?: CmsFieldDef
  fields?: CmsFieldDef[]
  options?: CmsFieldOptions
}

export type CmsSchemaDef = {
  fields: CmsFieldDef[]
}

export type CmsTypeStatus = "active" | "archived"
export type CmsEntryStatus = "draft" | "published" | "archived"

export type CmsType = {
  id: string
  tenantId: string
  alias: string
  name: string
  description: string | null
  icon: string | null
  schema: CmsSchemaDef
  schemaVersion: number
  groupOptions: string[] | null
  status: CmsTypeStatus
  createdAt: string
  updatedAt: string
}

export type CmsEntry = {
  id: string
  tenantId: string
  typeId: string
  typeAlias: string
  alias: string
  groupKey: string | null
  tags: string[]
  data: Record<string, unknown>
  status: CmsEntryStatus
  publishedAt: string | null
  schemaVersion: number
  version: number
  createdAt: string
  updatedAt: string
}

export type CreateCmsTypeInput = {
  alias: string
  name: string
  description?: string | null
  icon?: string | null
  schema: CmsSchemaDef
  groupOptions?: string[] | null
}

export type UpdateCmsTypeInput = {
  name?: string
  description?: string | null
  icon?: string | null
  schema?: CmsSchemaDef
  groupOptions?: string[] | null
  status?: CmsTypeStatus
}

export type CreateCmsEntryInput = {
  alias: string
  groupKey?: string | null
  tags?: string[]
  data: Record<string, unknown>
  status?: CmsEntryStatus
}

export type UpdateCmsEntryInput = {
  groupKey?: string | null
  tags?: string[]
  data?: Record<string, unknown>
  status?: CmsEntryStatus
  /** Optimistic concurrency token — must match the loaded entry's `version`. */
  version: number
}

export type ListEntriesFilter = {
  status?: CmsEntryStatus
  groupKey?: string
  tag?: string
  q?: string
  limit?: number
  offset?: number
}
