import { z } from "@hono/zod-openapi";

export const CurrentMauUsageSchema = z
  .object({
    yearMonth: z.string().openapi({ example: "2026-05" }),
    mau: z.number().int().nonnegative(),
    quota: z.number().int().nonnegative().nullable(),
    overage: z.number().int().nonnegative(),
    overageUnitsPer1k: z.number().int().nonnegative(),
    projectedOverageCents: z.number().int().nonnegative(),
    plan: z
      .object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      })
      .nullable(),
    subscriptionStatus: z
      .enum(["active", "past_due", "canceled"])
      .nullable(),
  })
  .openapi("CurrentMauUsage");

export const MauSnapshotSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    teamId: z.string(),
    periodStart: z.string().openapi({ example: "2026-04-01" }),
    mau: z.number().int().nonnegative(),
    source: z.string(),
    computedAt: z.string(),
  })
  .openapi("MauSnapshot");

export const MauHistoryResponseSchema = z
  .object({
    items: z.array(MauSnapshotSchema),
  })
  .openapi("MauHistoryResponse");

export const MauHistoryQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(36).optional().default(12),
  })
  .openapi("MauHistoryQuery");

export const SubscriptionInfoSchema = z
  .object({
    teamId: z.string(),
    plan: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      mauQuota: z.number().int().nonnegative(),
      overagePricePer1k: z.number().int().nonnegative(),
      basePriceCents: z.number().int().nonnegative(),
    }),
    status: z.enum(["active", "past_due", "canceled"]),
    billingCycleAnchor: z.string(),
  })
  .openapi("SubscriptionInfo");
