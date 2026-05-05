import { z } from "@hono/zod-openapi";

import { CLIENT_CREDENTIAL_KINDS } from "./types";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CredentialKindSchema = z
  .enum(CLIENT_CREDENTIAL_KINDS)
  .openapi({
    description:
      "'standard' — full HMAC flow; 'anonymous' — accepts any `x-end-user-id` (used by apollokit-pages anonymous projects).",
  });

export const CreateCredentialSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: "Production Keys" }),
    expiresAt: z.string().datetime().optional().openapi({
      example: "2027-01-01T00:00:00.000Z",
    }),
    metadata: z.record(z.string(), z.unknown()).optional(),
    kind: CredentialKindSchema.optional().default("standard"),
  })
  .openapi("CreateCredential");

export const CredentialIdParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "abc123" }),
  })
  .openapi("CredentialIdParam");

export const UpdateDevModeSchema = z
  .object({
    devMode: z.boolean(),
  })
  .openapi("UpdateDevMode");

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const CredentialResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    publishableKey: z.string(),
    kind: CredentialKindSchema,
    devMode: z.boolean(),
    enabled: z.boolean(),
    expiresAt: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ClientCredential");

export const CredentialCreatedResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    publishableKey: z.string().openapi({ example: "cpk_abc123..." }),
    secret: z.string().openapi({
      description:
        "Shown only once. Store securely. For 'anonymous' kind credentials this is still emitted but never required at verify time.",
      example: "csk_abc123...",
    }),
    kind: CredentialKindSchema,
    devMode: z.boolean(),
    enabled: z.boolean(),
    expiresAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("ClientCredentialCreated");

export const CredentialListResponseSchema = z
  .object({
    items: z.array(CredentialResponseSchema),
  })
  .openapi("ClientCredentialList");

export const RotateResponseSchema = z
  .object({
    id: z.string(),
    publishableKey: z.string(),
    secret: z.string().openapi({
      description: "New secret. Previous secret is now invalid.",
    }),
  })
  .openapi("RotateResult");

