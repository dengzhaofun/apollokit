/**
 * Zod schemas for the offline-check-in module.
 *
 * Like `check-in/validators.ts`, these are used for BOTH service input
 * validation AND HTTP request/response bodies. `.openapi(...)` metadata
 * keeps Scalar's docs honest and the generated SDK types accurate.
 *
 * Domain-specific cross-field validation is done via `.superRefine()`:
 *   - completion_rule.kind must align with mode
 *   - verification.methods must be non-empty
 */

import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import {
  OFFLINE_CHECK_IN_MODES,
  OFFLINE_CHECK_IN_STATUSES,
} from "./types";

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
    example: "tokyo-comicon-2026",
  });

const TimezoneSchema = z.string().min(1).max(64).default("UTC").openapi({
  description: "IANA timezone id, e.g. 'Asia/Shanghai'.",
  example: "Asia/Shanghai",
});

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const RewardEntrySchema = z
  .object({
    type: z.enum(["item", "entity", "currency"]),
    id: z.string(),
    count: z.number().int().positive(),
  })
  .openapi("RewardEntry");

const ModeSchema = z.enum(OFFLINE_CHECK_IN_MODES).openapi({
  description: "Campaign progression flavor.",
});

const StatusSchema = z.enum(OFFLINE_CHECK_IN_STATUSES).openapi({
  description: "Campaign lifecycle status.",
});

// ─── Completion rule (discriminated union) ───────────────────────

export const CompletionRuleSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("all") }),
    z.object({
      kind: z.literal("n_of_m"),
      n: z.number().int().positive(),
    }),
    z.object({
      kind: z.literal("daily_total"),
      days: z.number().int().positive(),
    }),
  ])
  .openapi("OfflineCheckInCompletionRule");

// ─── Verification declaration ────────────────────────────────────

const GpsMethodSchema = z.object({
  kind: z.literal("gps"),
  radiusM: z.number().int().min(1).max(10_000),
});

const QrMethodSchema = z.object({
  kind: z.literal("qr"),
  mode: z.enum(["static", "one_time"]),
});

const ManualCodeMethodSchema = z.object({
  kind: z.literal("manual_code"),
  staffOnly: z.boolean().optional(),
});

const PhotoMethodSchema = z.object({
  kind: z.literal("photo"),
  required: z.boolean().optional(),
});

export const VerificationMethodSchema = z
  .discriminatedUnion("kind", [
    GpsMethodSchema,
    QrMethodSchema,
    ManualCodeMethodSchema,
    PhotoMethodSchema,
  ])
  .openapi("OfflineCheckInVerificationMethod");

export const VerificationSchema = z
  .object({
    methods: z.array(VerificationMethodSchema).min(1),
    /**
     * No default — admins must explicitly opt into "any" (loose, single
     * verification suffices) vs "all" (strict, every method must pass).
     * Forcing the choice avoids the silent "I assumed 'any' was the
     * default" anti-fraud surprise.
     */
    combinator: z.enum(["any", "all"]),
  })
  .openapi("OfflineCheckInVerification");

// ─── Campaign CRUD ───────────────────────────────────────────────

export const CreateCampaignSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Tokyo Comicon 2026" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    bannerImage: z.string().url().nullable().optional(),
    mode: ModeSchema,
    completionRule: CompletionRuleSchema,
    completionRewards: z.array(RewardEntrySchema).default([]),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    timezone: TimezoneSchema.optional(),
    collectionAlbumId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    // completion_rule.kind compatibility with mode:
    //   collect → "all" or "n_of_m"
    //   daily   → "daily_total" (or "all" / "n_of_m" if the org wants
    //             daily-mode but a per-spot completion definition)
    if (val.mode === "daily" && val.completionRule.kind === "daily_total") {
      // ok
    } else if (val.mode === "collect" && val.completionRule.kind === "daily_total") {
      ctx.addIssue({
        code: "custom",
        path: ["completionRule"],
        message:
          "completionRule.kind 'daily_total' is only valid when mode='daily'",
      });
    }
    if (val.startAt && val.endAt) {
      if (new Date(val.startAt).getTime() >= new Date(val.endAt).getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["endAt"],
          message: "endAt must be after startAt",
        });
      }
    }
  })
  .openapi("OfflineCheckInCreateCampaign");

export const UpdateCampaignSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    bannerImage: z.string().url().nullable().optional(),
    completionRule: CompletionRuleSchema.optional(),
    completionRewards: z.array(RewardEntrySchema).optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    timezone: TimezoneSchema.optional(),
    status: StatusSchema.optional(),
    collectionAlbumId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("OfflineCheckInUpdateCampaign");

export type CreateCampaignInput = z.input<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.input<typeof UpdateCampaignSchema>;

// ─── Spot CRUD ───────────────────────────────────────────────────

export const CreateSpotSchema = z
  .object({
    alias: AliasSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().url().nullable().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    geofenceRadiusM: z.number().int().min(1).max(10_000).default(100),
    verification: VerificationSchema,
    spotRewards: z.array(RewardEntrySchema).default([]),
    collectionEntryAliases: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    metadata: MetadataSchema,
  })
  .openapi("OfflineCheckInCreateSpot");

export const UpdateSpotSchema = z
  .object({
    alias: AliasSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().url().nullable().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    geofenceRadiusM: z.number().int().min(1).max(10_000).optional(),
    verification: VerificationSchema.optional(),
    spotRewards: z.array(RewardEntrySchema).optional(),
    collectionEntryAliases: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("OfflineCheckInUpdateSpot");

export type CreateSpotInput = z.input<typeof CreateSpotSchema>;
export type UpdateSpotInput = z.input<typeof UpdateSpotSchema>;

// ─── Path / query params ─────────────────────────────────────────

export const CampaignKeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Campaign id or alias.",
  }),
});

export const CampaignIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Campaign id.",
  }),
});

export const SpotIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Spot id.",
  }),
});

// ─── Check-in payload ────────────────────────────────────────────

export const CheckInRequestSchema = z
  .object({
    spotAlias: z.string().min(1).openapi({
      description: "The spot's alias (unique within the campaign).",
      example: "main-stage",
    }),
    endUserId: z.string().min(1).max(256).openapi({
      description:
        "The SaaS tenant's business user id. Required only on the admin endpoint; client endpoint reads it from headers.",
    }),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().nonnegative().optional(),
    qrToken: z.string().optional(),
    manualCode: z.string().optional(),
    mediaAssetId: z.string().uuid().nullable().optional(),
    deviceFingerprint: z.string().max(256).optional(),
  })
  .openapi("OfflineCheckInRequest");

/**
 * Client-side variant — same body, just without `endUserId` (it comes
 * from the `x-end-user-id` + `x-user-hash` headers via
 * `requireClientUser`).
 */
export const ClientCheckInRequestSchema = CheckInRequestSchema.omit({
  endUserId: true,
}).openapi("OfflineCheckInClientRequest");

// ─── Response shapes ─────────────────────────────────────────────

const VerifiedKindSchema = z.enum(["gps", "qr", "manual_code", "photo"]);

export const CampaignResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    bannerImage: z.string().nullable(),
    mode: ModeSchema,
    completionRule: CompletionRuleSchema,
    completionRewards: z.array(RewardEntrySchema),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    timezone: z.string(),
    status: StatusSchema,
    collectionAlbumId: z.string().nullable(),
    activityNodeId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("OfflineCheckInCampaign");

export const SpotResponseSchema = z
  .object({
    id: z.string(),
    campaignId: z.string(),
    tenantId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    coverImage: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    geofenceRadiusM: z.number().int(),
    verification: VerificationSchema,
    spotRewards: z.array(RewardEntrySchema),
    collectionEntryAliases: z.array(z.string()),
    sortOrder: z.string(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("OfflineCheckInSpot");

export const ProgressResponseSchema = z
  .object({
    campaignId: z.string(),
    endUserId: z.string(),
    tenantId: z.string(),
    spotsCompleted: z.array(z.string()),
    totalCount: z.number().int(),
    lastSpotId: z.string().nullable(),
    lastCheckInAt: z.string().nullable(),
    dailyCount: z.number().int(),
    dailyDates: z.array(z.string()),
    completedAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("OfflineCheckInUserProgress");

export const CheckInResultSchema = z
  .object({
    accepted: z.boolean(),
    granted: z.array(RewardEntrySchema),
    justCompleted: z.boolean(),
    verifiedVia: z.array(VerifiedKindSchema),
    progress: ProgressResponseSchema,
    distanceM: z.number().nullable(),
    rejectReason: z.string().nullable(),
  })
  .openapi("OfflineCheckInResult");

export const CampaignListResponseSchema = pageOf(CampaignResponseSchema).openapi(
  "OfflineCheckInCampaignList",
);

export const SpotListResponseSchema = z
  .object({ items: z.array(SpotResponseSchema) })
  .openapi("OfflineCheckInSpotList");

export const ProgressListResponseSchema = pageOf(ProgressResponseSchema).openapi(
  "OfflineCheckInProgressList",
);

// ─── Manual code rotation ────────────────────────────────────────

export const ManualCodeResponseSchema = z
  .object({
    code: z.string(),
    rotatesAt: z.string().openapi({
      description:
        "ISO timestamp at which the current code expires; the next rotation will produce a new value.",
    }),
  })
  .openapi("OfflineCheckInManualCode");

// ─── QR token mint ───────────────────────────────────────────────

export const MintQrTokensRequestSchema = z
  .object({
    count: z.number().int().min(1).max(500).default(1).openapi({
      description: "Number of one-time tokens to mint.",
    }),
    ttlSeconds: z.number().int().min(60).max(7 * 24 * 3600).default(3600),
  })
  .openapi("OfflineCheckInMintQrTokens");

export const MintQrTokensResponseSchema = z
  .object({
    tokens: z.array(z.string()),
    expiresAt: z.string(),
  })
  .openapi("OfflineCheckInMintQrTokensResult");
