import { z } from "zod";

import { ALL_TENANT_PIPES } from "./types";

const pipeNameSchema = z.enum(
  ALL_TENANT_PIPES as unknown as [string, ...string[]],
);

export const issueTokenBodySchema = z
  .object({
    pipes: z
      .array(pipeNameSchema)
      .min(1)
      .describe("Pipes this JWT may query. Must be a non-empty subset."),
    ttlSeconds: z
      .number()
      .int()
      .min(60)
      .max(3600)
      .optional()
      .describe("Token lifetime. Default 600s (10 min)."),
  })
  .openapi("IssueAnalyticsTokenBody");

export const issueTokenResponseSchema = z
  .object({
    token: z.string(),
    expiresAt: z.string().datetime(),
    baseUrl: z
      .string()
      .url()
      .describe("Base URL for Tinybird pipes — concat `<pipe>.json?token=...`."),
    pipes: z.array(pipeNameSchema),
  })
  .openapi("IssueAnalyticsTokenResponse");

export type IssueTokenBody = z.infer<typeof issueTokenBodySchema>;
export type IssueTokenResponse = z.infer<typeof issueTokenResponseSchema>;
