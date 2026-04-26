import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({ example: "gold-savings" });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional();

const TypeSchema = z.enum(["demand", "fixed"]).openapi({
  description: "'demand' = withdraw any time; 'fixed' = locked until maturesAt.",
});

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Gold Savings" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    type: TypeSchema,
    lockupDays: z.number().int().positive().nullable().optional().openapi({
      description: "Required when type='fixed'. Ignored when type='demand'.",
    }),
    interestRateBps: z.number().int().min(0).max(1_000_000).optional().openapi({
      description:
        "Interest rate in basis points (100 = 1%). Applied over interestPeriodDays.",
    }),
    interestPeriodDays: z.number().int().positive().optional().openapi({
      description:
        "Number of days the interestRateBps applies to (e.g. 365 for annual).",
    }),
    acceptedCurrencyIds: z
      .array(z.string().uuid())
      .min(1)
      .openapi({
        description:
          "Whitelist of currencies.id the box accepts. Each must be a currency definition in the same org.",
      }),
    minDeposit: z.number().int().positive().nullable().optional(),
    maxDeposit: z.number().int().positive().nullable().optional(),
    allowEarlyWithdraw: z.boolean().optional().openapi({
      description:
        "Only meaningful for type='fixed'. If true, early withdrawal forfeits accrued interest.",
    }),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("StorageBoxCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    type: TypeSchema.optional(),
    lockupDays: z.number().int().positive().nullable().optional(),
    interestRateBps: z.number().int().min(0).max(1_000_000).optional(),
    interestPeriodDays: z.number().int().positive().optional(),
    acceptedCurrencyIds: z.array(z.string().uuid()).min(1).optional(),
    minDeposit: z.number().int().positive().nullable().optional(),
    maxDeposit: z.number().int().positive().nullable().optional(),
    allowEarlyWithdraw: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("StorageBoxUpdateConfig");

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

export const DepositSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    boxConfigId: z.string().uuid(),
    currencyDefinitionId: z.string().uuid(),
    amount: z.number().int().positive(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("StorageBoxDepositRequest");

export const WithdrawSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    depositId: z.string().uuid().optional().openapi({
      description:
        "Required for fixed-term deposits. For demand, omit and pass boxConfigId + currencyDefinitionId.",
    }),
    boxConfigId: z.string().uuid().optional(),
    currencyDefinitionId: z.string().uuid().optional(),
    amount: z.number().int().positive().optional().openapi({
      description:
        "Demand only — partial withdraw amount. Omit to withdraw everything (principal + interest).",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("StorageBoxWithdrawRequest");

export type DepositInput = z.input<typeof DepositSchema>;
export type WithdrawInput = z.input<typeof WithdrawSchema>;

// ─── Param / query schemas ──────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "UUID or alias.",
  }),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
  }),
});

// ─── Response schemas ───────────────────────────────────────────────

export const ConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    type: z.string(),
    lockupDays: z.number().int().nullable(),
    interestRateBps: z.number().int(),
    interestPeriodDays: z.number().int(),
    acceptedCurrencyIds: z.array(z.string()),
    minDeposit: z.number().int().nullable(),
    maxDeposit: z.number().int().nullable(),
    allowEarlyWithdraw: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("StorageBoxConfig");

export const ConfigListResponseSchema = pageOf(ConfigResponseSchema).openapi(
  "StorageBoxConfigList",
);

export const DepositViewSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    endUserId: z.string(),
    boxConfigId: z.string(),
    currencyDefinitionId: z.string(),
    principal: z.number().int(),
    accruedInterest: z.number().int(),
    projectedInterest: z.number().int(),
    status: z.string(),
    isSingleton: z.boolean(),
    isMatured: z.boolean(),
    depositedAt: z.string(),
    lastAccrualAt: z.string(),
    maturesAt: z.string().nullable(),
    withdrawnAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("StorageBoxDepositView");

export const DepositListResponseSchema = z
  .object({ items: z.array(DepositViewSchema) })
  .openapi("StorageBoxDepositList");

export const DepositResultSchema = z
  .object({
    deposit: DepositViewSchema,
    currencyDeducted: z.number().int(),
  })
  .openapi("StorageBoxDepositResult");

export const WithdrawResultSchema = z
  .object({
    deposit: DepositViewSchema,
    principalPaid: z.number().int(),
    interestPaid: z.number().int(),
    currencyGranted: z.number().int(),
  })
  .openapi("StorageBoxWithdrawResult");

