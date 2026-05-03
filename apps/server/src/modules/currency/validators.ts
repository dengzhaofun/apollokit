import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";
import { sql } from "drizzle-orm";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { currencies } from "../../schema/currency";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description: "Optional human-readable key, unique within the project.",
    example: "gem",
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

// ─── Definition CRUD ────────────────────────────────────────────────

export const CreateCurrencySchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Gem" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional().openapi({
      description:
        "Soft link to activity_configs.id when the currency is activity-scoped. NULL = permanent.",
    }),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CurrencyCreateDefinition");

export const UpdateCurrencySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CurrencyUpdateDefinition");

export type CreateCurrencyInput = z.input<typeof CreateCurrencySchema>;
export type UpdateCurrencyInput = z.input<typeof UpdateCurrencySchema>;

// ─── Grant / Deduct ─────────────────────────────────────────────────

const GrantEntrySchema = z.object({
  currencyId: z.string().uuid(),
  amount: z.number().int().positive(),
});

export const GrantCurrencySchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    grants: z.array(GrantEntrySchema).min(1),
    source: z.string().min(1).max(128).openapi({
      example: "admin_grant",
    }),
    sourceId: z.string().max(256).optional(),
  })
  .openapi("CurrencyGrantRequest");

export const DeductCurrencySchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    deductions: z.array(GrantEntrySchema).min(1),
    source: z.string().min(1).max(128),
    sourceId: z.string().max(256).optional(),
  })
  .openapi("CurrencyDeductRequest");

export type GrantCurrencyInput = z.input<typeof GrantCurrencySchema>;
export type DeductCurrencyInput = z.input<typeof DeductCurrencySchema>;

// ─── Param / Query ──────────────────────────────────────────────────

export const KeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Id or alias.",
  }),
});

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "UUID.",
  }),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
  }),
});

export const CurrencyIdParamSchema = z.object({
  currencyId: z.string().uuid().openapi({
    param: { name: "currencyId", in: "path" },
  }),
});

export const currencyDefinitionFilters = defineListFilter({
  activityId: f.string({
    column: currencies.activityId,
    where: (v: string) =>
      v === "null"
        ? sql`${currencies.activityId} IS NULL`
        : sql`${currencies.activityId} = ${v}`,
  }),
  isActive: f.boolean({ column: currencies.isActive }),
})
  .search({
    columns: [currencies.name, currencies.alias],
  })
  .build();

export const DefinitionListQuerySchema =
  currencyDefinitionFilters.querySchema.openapi("CurrencyDefinitionListQuery");

export const LedgerQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).optional().openapi({
    param: { name: "endUserId", in: "query" },
  }),
  currencyId: z.string().uuid().optional().openapi({
    param: { name: "currencyId", in: "query" },
  }),
  source: z.string().max(128).optional().openapi({
    param: { name: "source", in: "query" },
  }),
  sourceId: z.string().max(256).optional().openapi({
    param: { name: "sourceId", in: "query" },
  }),
  limit: z.coerce.number().int().positive().max(200).optional().openapi({
    param: { name: "limit", in: "query" },
  }),
  cursor: z.string().optional().openapi({
    param: { name: "cursor", in: "query" },
  }),
});

export const WalletsQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
  }),
});

// ─── Response shapes ────────────────────────────────────────────────

export const CurrencyDefinitionResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    activityId: z.string().nullable(),
    activityNodeId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CurrencyDefinition");

export const DefinitionListResponseSchema = pageOf(CurrencyDefinitionResponseSchema).openapi(
  "CurrencyDefinitionList",
);

export const WalletViewSchema = z
  .object({
    currencyId: z.string(),
    currencyAlias: z.string().nullable(),
    currencyName: z.string(),
    icon: z.string().nullable(),
    balance: z.number().int(),
  })
  .openapi("CurrencyWalletView");

export const WalletListResponseSchema = z
  .object({ items: z.array(WalletViewSchema) })
  .openapi("CurrencyWalletList");

export const BalanceResponseSchema = z
  .object({
    currencyId: z.string(),
    balance: z.number().int(),
  })
  .openapi("CurrencyBalance");

export const GrantResultSchema = z
  .object({
    grants: z.array(
      z.object({
        currencyId: z.string(),
        balanceBefore: z.number().int(),
        balanceAfter: z.number().int(),
        delta: z.number().int(),
      }),
    ),
  })
  .openapi("CurrencyGrantResult");

export const DeductResultSchema = z
  .object({
    deductions: z.array(
      z.object({
        currencyId: z.string(),
        balanceBefore: z.number().int(),
        balanceAfter: z.number().int(),
        delta: z.number().int(),
      }),
    ),
  })
  .openapi("CurrencyDeductResult");

export const LedgerEntryResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    endUserId: z.string(),
    currencyId: z.string(),
    delta: z.number().int(),
    source: z.string(),
    sourceId: z.string().nullable(),
    balanceBefore: z.number().int().nullable(),
    balanceAfter: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .openapi("CurrencyLedgerEntry");

export const LedgerListResponseSchema = z
  .object({
    items: z.array(LedgerEntryResponseSchema),
    nextCursor: z.string().optional(),
  })
  .openapi("CurrencyLedgerList");

