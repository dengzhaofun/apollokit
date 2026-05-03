import { z } from "@hono/zod-openapi";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import {
  cdkeyCodes,
  cdkeyRedemptionLogs,
} from "../../schema/cdkey";

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

const RewardEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const CodeTypeSchema = z.enum(["universal", "unique"]).openapi({
  description:
    "'universal' = one shared string for many users (limited by totalLimit/perUserLimit). " +
    "'unique' = each string redeemable once; supply initialCount to batch-generate.",
});

// Accept ISO date strings. We store as Date in schema; service converts.
const IsoDateSchema = z
  .string()
  .datetime({ offset: true })
  .openapi({ example: "2026-02-01T00:00:00Z" });

// ─── Batch create / update ──────────────────────────────────────

export const CreateBatchSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .openapi({ example: "Spring Festival Code" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    codeType: CodeTypeSchema,
    reward: z.array(RewardEntrySchema).min(1).openapi({
      description: "Items granted on successful redemption.",
    }),
    totalLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().optional().openapi({
      description:
        "Max redemptions per end-user on this batch. Default 1. " +
        "Only enforced for universal batches.",
    }),
    startsAt: IsoDateSchema.nullable().optional(),
    endsAt: IsoDateSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,

    // Universal-batch only: optional explicit code string. If omitted, one
    // will be generated.
    universalCode: z
      .string()
      .min(4)
      .max(64)
      .optional()
      .openapi({
        description:
          "For universal batches: the shared code string. If omitted, one is generated.",
      }),
    // Unique-batch only: how many codes to generate initially.
    initialCount: z
      .number()
      .int()
      .positive()
      .max(10000)
      .optional()
      .openapi({
        description: "For unique batches: number of codes to pre-generate.",
      }),
  })
  .openapi("CdkeyCreateBatch");

export const UpdateBatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    reward: z.array(RewardEntrySchema).min(1).optional(),
    totalLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().optional(),
    startsAt: IsoDateSchema.nullable().optional(),
    endsAt: IsoDateSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CdkeyUpdateBatch");

export type CreateBatchInput = z.input<typeof CreateBatchSchema>;
export type UpdateBatchInput = z.input<typeof UpdateBatchSchema>;

// ─── Generate / list codes ─────────────────────────────────────

export const GenerateCodesSchema = z
  .object({
    count: z.number().int().positive().max(10000),
  })
  .openapi("CdkeyGenerateCodes");

export type GenerateCodesInput = z.input<typeof GenerateCodesSchema>;

export const cdkeyCodeFilters = defineListFilter({
  status: f.enumOf(["pending", "redeemed", "revoked", "active"], {
    column: cdkeyCodes.status,
  }),
})
  .search({ columns: [cdkeyCodes.code] })
  .build();

export const CodeListQuerySchema = cdkeyCodeFilters.querySchema.openapi(
  "CdkeyCodeListQuery",
);

export const cdkeyLogFilters = defineListFilter({
  status: f.enumOf(["success", "failed"], {
    column: cdkeyRedemptionLogs.status,
  }),
})
  .search({ columns: [cdkeyRedemptionLogs.code] })
  .build();

export const LogListQuerySchema = cdkeyLogFilters.querySchema.openapi(
  "CdkeyLogListQuery",
);

// ─── Redeem ────────────────────────────────────────────────────

export const AdminRedeemSchema = z
  .object({
    code: z.string().min(1).max(256),
    endUserId: z.string().min(1).max(256).openapi({ example: "user-42" }),
    idempotencyKey: z.string().min(1).max(256),
  })
  .openapi("CdkeyAdminRedeemRequest");

export const ClientRedeemSchema = z
  .object({
    code: z.string().min(1).max(256),
    idempotencyKey: z.string().min(1).max(256),
  })
  .openapi("CdkeyClientRedeemRequest");

// ─── Params ────────────────────────────────────────────────────

export const BatchKeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Batch id or alias.",
  }),
});

export const BatchIdParamSchema = z.object({
  batchId: z.string().min(1).openapi({
    param: { name: "batchId", in: "path" },
    description: "Batch UUID.",
  }),
});

export const CodeIdParamSchema = z.object({
  codeId: z.string().min(1).openapi({
    param: { name: "codeId", in: "path" },
    description: "Code UUID.",
  }),
});

// ─── Response schemas ──────────────────────────────────────────

const RewardEntryResponseSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int(),
});

export const BatchResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    codeType: CodeTypeSchema,
    reward: z.array(RewardEntryResponseSchema),
    totalLimit: z.number().int().nullable(),
    perUserLimit: z.number().int(),
    totalRedeemed: z.number().int(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CdkeyBatch");

export const BatchListResponseSchema = pageOf(BatchResponseSchema).openapi(
  "CdkeyBatchList",
);

export const CodeResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    batchId: z.string(),
    code: z.string(),
    status: z.string(),
    redeemedBy: z.string().nullable(),
    redeemedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("CdkeyCode");

export const CodeListResponseSchema = pageOf(CodeResponseSchema).openapi("CdkeyCodeList");

export const GenerateCodesResponseSchema = z
  .object({ generated: z.number().int() })
  .openapi("CdkeyGenerateCodesResult");

export const RedeemResultSchema = z
  .object({
    status: z.enum(["success", "already_redeemed"]),
    batchId: z.string(),
    codeId: z.string(),
    code: z.string(),
    reward: z.array(RewardEntryResponseSchema),
    logId: z.string(),
  })
  .openapi("CdkeyRedeemResult");

export const LogResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    endUserId: z.string(),
    batchId: z.string(),
    codeId: z.string().nullable(),
    code: z.string(),
    source: z.string(),
    sourceId: z.string(),
    status: z.string(),
    failReason: z.string().nullable(),
    reward: z.array(RewardEntryResponseSchema).nullable(),
    createdAt: z.string(),
  })
  .openapi("CdkeyRedemptionLog");

export const LogListResponseSchema = pageOf(LogResponseSchema).openapi(
  "CdkeyRedemptionLogList",
);

