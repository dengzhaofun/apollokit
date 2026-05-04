import { z } from "@hono/zod-openapi";

const SORT_KEYS = [
  "organizationName",
  "teamName",
  "mau",
  "overage",
  "projectedOverageCents",
] as const;

export const PlatformMauQuerySchema = z
  .object({
    sortBy: z.enum(SORT_KEYS).optional().default("overage"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
    q: z.string().trim().min(1).max(128).optional(),
  })
  .openapi("PlatformMauQuery");

export const PlatformTeamUsageRowSchema = z
  .object({
    organizationId: z.string(),
    organizationName: z.string(),
    teamId: z.string(),
    teamName: z.string(),
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
  .openapi("PlatformTeamUsageRow");

export const PlatformMauResponseSchema = z
  .object({
    yearMonth: z.string().openapi({ example: "2026-05" }),
    items: z.array(PlatformTeamUsageRowSchema),
    totals: z.object({
      teams: z.number().int().nonnegative(),
      mau: z.number().int().nonnegative(),
      projectedOverageCents: z.number().int().nonnegative(),
    }),
  })
  .openapi("PlatformMauResponse");
