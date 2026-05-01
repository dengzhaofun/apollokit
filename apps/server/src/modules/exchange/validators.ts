import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";

import { pageOf } from "../../lib/pagination";

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
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const ExchangeItemEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

// ─── Config ─────────────────────────────────────────────────────

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Spring Festival Exchange" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExchangeCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExchangeUpdateConfig");

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

// ─── Option ─────────────────────────────────────────────────────

export const CreateOptionSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "100 Gold → 1 Potion" }),
    description: z.string().max(2000).nullable().optional(),
    costItems: z.array(ExchangeItemEntrySchema).min(1).openapi({
      description: "Resources consumed.",
    }),
    rewardItems: z.array(ExchangeItemEntrySchema).min(1).openapi({
      description: "Resources rewarded.",
    }),
    userLimit: z.number().int().positive().nullable().optional(),
    globalLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExchangeCreateOption");

export const UpdateOptionSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    costItems: z.array(ExchangeItemEntrySchema).min(1).optional(),
    rewardItems: z.array(ExchangeItemEntrySchema).min(1).optional(),
    userLimit: z.number().int().positive().nullable().optional(),
    globalLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExchangeUpdateOption");

export type CreateOptionInput = z.input<typeof CreateOptionSchema>;
export type UpdateOptionInput = z.input<typeof UpdateOptionSchema>;

// ─── Execute ────────────────────────────────────────────────────

export const ExecuteExchangeSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    idempotencyKey: z.string().max(256).optional().openapi({
      description: "Optional idempotency key to prevent duplicate execution.",
    }),
  })
  .openapi("ExchangeExecuteRequest");

export const ClientExecuteExchangeSchema = z
  .object({
    optionId: z.string().uuid().openapi({
      description: "The exchange option to execute.",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ClientExchangeExecuteRequest");

// ─── Params ─────────────────────────────────────────────────────

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

export const ConfigKeyParamSchema = z.object({
  configKey: z.string().min(1).openapi({
    param: { name: "configKey", in: "path" },
    description: "Config id or alias.",
  }),
});

export const OptionIdParamSchema = z.object({
  optionId: z.string().min(1).openapi({
    param: { name: "optionId", in: "path" },
    description: "Option UUID.",
  }),
});

// ─── Response schemas ───────────────────────────────────────────

const ExchangeItemResponseSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int(),
});

export const ExchangeConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ExchangeConfig");

export const ExchangeOptionResponseSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    costItems: z.array(ExchangeItemResponseSchema),
    rewardItems: z.array(ExchangeItemResponseSchema),
    userLimit: z.number().int().nullable(),
    globalLimit: z.number().int().nullable(),
    globalCount: z.number().int(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ExchangeOption");

export const ExchangeResultSchema = z
  .object({
    success: z.boolean(),
    exchangeId: z.string(),
    optionId: z.string(),
    costItems: z.array(ExchangeItemResponseSchema),
    rewardItems: z.array(ExchangeItemResponseSchema),
  })
  .openapi("ExchangeResult");

export const ExchangeUserStateResponseSchema = z
  .object({
    optionId: z.string(),
    endUserId: z.string(),
    count: z.number().int(),
  })
  .openapi("ExchangeUserState");

export const ConfigListResponseSchema = pageOf(ExchangeConfigResponseSchema).openapi(
  "ExchangeConfigList",
);

export const OptionListResponseSchema = pageOf(ExchangeOptionResponseSchema).openapi(
  "ExchangeOptionList",
);

