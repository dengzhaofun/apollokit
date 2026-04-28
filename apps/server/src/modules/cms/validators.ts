/**
 * Zod schemas for the CMS module — HTTP request/response shapes.
 *
 * The DSL (`CmsFieldDef` etc.) is described in `types.ts` as TypeScript
 * types. Here we re-state the same shape as Zod schemas with `.openapi()`
 * metadata so the generated OpenAPI spec advertises a usable shape for
 * the schema builder.
 */

import { z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { cmsEntries, cmsTypes } from "../../schema/cms";
import { CMS_FIELD_TYPES } from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  });

const FieldNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: "field name must be a valid identifier",
  });

const TagSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9\-_]*$/, {
    message: "tag must start with [a-z0-9] and contain only [a-z0-9-_]",
  });

// ─── CmsSchemaDef → Zod (via z.lazy for recursion) ──────────────────

const CmsEnumOptionSchema = z.object({
  value: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
});

const CmsFieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    enum: z.array(CmsEnumOptionSchema).optional(),
  })
  .optional();

const CmsFieldOptionsSchema = z
  .object({
    placeholder: z.string().optional(),
    rows: z.number().int().positive().optional(),
    refTypeAlias: z.string().optional(),
    accept: z.array(z.string()).optional(),
  })
  .optional();

type CmsFieldDefShape = {
  name: string;
  label: string;
  description?: string;
  type: (typeof CMS_FIELD_TYPES)[number];
  required?: boolean;
  default?: unknown;
  validation?: z.infer<typeof CmsFieldValidationSchema>;
  itemDef?: CmsFieldDefShape;
  fields?: CmsFieldDefShape[];
  options?: z.infer<typeof CmsFieldOptionsSchema>;
};

export const CmsFieldDefSchema: z.ZodType<CmsFieldDefShape> = z.lazy(() =>
  z
    .object({
      name: FieldNameSchema,
      label: z.string().min(1).max(256),
      description: z.string().max(2000).optional(),
      type: z.enum(CMS_FIELD_TYPES),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      validation: CmsFieldValidationSchema,
      itemDef: CmsFieldDefSchema.optional(),
      fields: z.array(CmsFieldDefSchema).optional(),
      options: CmsFieldOptionsSchema,
    })
    // Register as a named OpenAPI component INSIDE z.lazy so the
    // generator emits `$ref: '#/components/schemas/CmsFieldDef'` at
    // each self-reference instead of recursing into safeParse() — the
    // recursive parse otherwise blows the stack inside zod-to-openapi's
    // isNullable/isOptional heuristics.
    .openapi("CmsFieldDef"),
);

export const CmsSchemaDefSchema = z
  .object({
    fields: z.array(CmsFieldDefSchema),
  })
  .openapi("CmsSchemaDef");

// ─── Type-level CRUD ────────────────────────────────────────────────

export const CmsTypeStatusSchema = z.enum(["active", "archived"]);

export const CreateCmsTypeSchema = z
  .object({
    alias: AliasSchema.openapi({ example: "blog-post" }),
    name: z.string().min(1).max(200).openapi({ example: "Blog Post" }),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    schema: CmsSchemaDefSchema,
    groupOptions: z.array(z.string().min(1).max(64)).nullable().optional(),
  })
  .openapi("CmsCreateType");

export const UpdateCmsTypeSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    /**
     * Updating `schema` triggers an additive-only check
     * (see schema-validator.assertNonBreakingChange). On accepted
     * change, `schemaVersion` is auto-incremented by the service.
     */
    schema: CmsSchemaDefSchema.optional(),
    groupOptions: z.array(z.string().min(1).max(64)).nullable().optional(),
    status: CmsTypeStatusSchema.optional(),
  })
  .openapi("CmsUpdateType");

export type CreateCmsTypeInput = z.input<typeof CreateCmsTypeSchema>;
export type UpdateCmsTypeInput = z.input<typeof UpdateCmsTypeSchema>;

export const CmsTypeKeyParamSchema = z.object({
  typeKey: z
    .string()
    .min(1)
    .openapi({
      param: { name: "typeKey", in: "path" },
      description: "type id (uuid) or alias",
    }),
});

export const CmsTypeAliasParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
    description: "type alias",
  }),
});

export const CmsTypeResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    schema: CmsSchemaDefSchema,
    schemaVersion: z.number().int(),
    groupOptions: z.array(z.string()).nullable(),
    status: CmsTypeStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CmsType");

export const CmsTypeListResponseSchema = pageOf(CmsTypeResponseSchema).openapi("CmsTypeList");

// ─── Entry-level CRUD ───────────────────────────────────────────────

export const CmsEntryStatusSchema = z.enum(["draft", "published", "archived"]);

export const CreateCmsEntrySchema = z
  .object({
    alias: AliasSchema.openapi({ example: "hello-world" }),
    groupKey: z.string().min(1).max(64).nullable().optional(),
    tags: z.array(TagSchema).max(32).optional(),
    /**
     * Validated against the type's schema by the service. Shape varies
     * by type — declared as record for OpenAPI purposes.
     */
    data: z.record(z.string(), z.unknown()),
    status: CmsEntryStatusSchema.optional(),
  })
  .openapi("CmsCreateEntry");

export const UpdateCmsEntrySchema = z
  .object({
    groupKey: z.string().min(1).max(64).nullable().optional(),
    tags: z.array(TagSchema).max(32).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    status: CmsEntryStatusSchema.optional(),
    /** Optimistic concurrency token — mismatch → 409 */
    version: z.number().int().positive(),
  })
  .openapi("CmsUpdateEntry");

export type CreateCmsEntryInput = z.input<typeof CreateCmsEntrySchema>;
export type UpdateCmsEntryInput = z.input<typeof UpdateCmsEntrySchema>;

export const CmsEntryKeyParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
  }),
  entryKey: z
    .string()
    .min(1)
    .openapi({
      param: { name: "entryKey", in: "path" },
      description: "entry id (uuid) or alias",
    }),
});

export const CmsEntryAliasParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
  }),
  entryAlias: AliasSchema.openapi({
    param: { name: "entryAlias", in: "path" },
  }),
});

export const cmsTypeFilters = defineListFilter({
  status: f.enumOf(["active", "archived"], { column: cmsTypes.status }),
})
  .search({ columns: [cmsTypes.name, cmsTypes.alias] })
  .build();

export const ListCmsTypesQuerySchema = cmsTypeFilters.querySchema.openapi(
  "ListCmsTypesQuery",
);

export const cmsEntryFilters = defineListFilter({
  status: f.enumOf(["draft", "published", "archived"], {
    column: cmsEntries.status,
  }),
  groupKey: f.string({ column: cmsEntries.groupKey, ops: ["eq"] }),
  tag: f.string({
    column: cmsEntries.alias,
    where: (v: string) => sql`${cmsEntries.tags} @> ARRAY[${v}]::text[]`,
  }),
})
  .search({ columns: [cmsEntries.alias] })
  .build();

export const ListEntriesQuerySchema = z.object({
  status: CmsEntryStatusSchema.optional().openapi({
    param: { name: "status", in: "query" },
  }),
  groupKey: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .openapi({ param: { name: "groupKey", in: "query" } }),
  tag: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .openapi({
      param: { name: "tag", in: "query" },
      description: "filter to entries containing this tag",
    }),
  q: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .openapi({
      param: { name: "q", in: "query" },
      description: "search alias prefix",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .openapi({ param: { name: "limit", in: "query" } }),
  cursor: z.string().optional().openapi({ param: { name: "cursor", in: "query" } }),
});

export const CmsEntryResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    typeId: z.string(),
    typeAlias: z.string(),
    alias: z.string(),
    groupKey: z.string().nullable(),
    tags: z.array(z.string()),
    data: z.record(z.string(), z.unknown()),
    status: CmsEntryStatusSchema,
    publishedAt: z.string().nullable(),
    schemaVersion: z.number().int(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CmsEntry");

export const CmsEntryListResponseSchema = pageOf(CmsEntryResponseSchema).openapi(
  "CmsEntryList",
);

// ─── Client-route response (sanitized) ──────────────────────────────

/**
 * Public-facing shape — drops internal-only fields like `id`, `typeId`,
 * `createdBy`, `version`, `status` (only published entries reach client
 * routes), and timestamps other than `publishedAt`.
 */
export const CmsClientEntrySchema = z
  .object({
    typeAlias: z.string(),
    alias: z.string(),
    groupKey: z.string().nullable(),
    tags: z.array(z.string()),
    data: z.record(z.string(), z.unknown()),
    schemaVersion: z.number().int(),
    publishedAt: z.string(),
  })
  .openapi("CmsClientEntry");

export const CmsClientEntryListSchema = z
  .object({
    items: z.array(CmsClientEntrySchema),
  })
  .openapi("CmsClientEntryList");

// ─── Client-route query / params ────────────────────────────────────

export const CmsClientByAliasParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
  }),
  entryAlias: AliasSchema.openapi({
    param: { name: "entryAlias", in: "path" },
  }),
});

export const CmsClientGroupParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
  }),
  groupKey: z.string().min(1).max(64).openapi({
    param: { name: "groupKey", in: "path" },
  }),
});

export const CmsClientTagParamSchema = z.object({
  tag: z.string().min(1).max(64).openapi({
    param: { name: "tag", in: "path" },
  }),
});

export const CmsClientListParamSchema = z.object({
  typeAlias: AliasSchema.openapi({
    param: { name: "typeAlias", in: "path" },
  }),
});

export const CmsClientListQuerySchema = z.object({
  groupKey: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .openapi({ param: { name: "groupKey", in: "query" } }),
  tag: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .openapi({ param: { name: "tag", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .optional()
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(0)
    .optional()
    .openapi({ param: { name: "offset", in: "query" } }),
});
