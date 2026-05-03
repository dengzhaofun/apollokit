/**
 * Zod schemas for the character module. Same alias regex as dialogue /
 * item definitions to keep the public handle shape uniform across the
 * catalog-style modules.
 */

import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { CHARACTER_SIDES } from "./types";

const AliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9\-_]*$/, {
    message: "alias must be lowercase alphanumeric plus '-' or '_'",
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const UrlSchema = z.string().url().max(2048);

export const CreateCharacterSchema = z
  .object({
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(128),
    description: z.string().max(2000).nullable().optional(),
    avatarUrl: UrlSchema.nullable().optional(),
    portraitUrl: UrlSchema.nullable().optional(),
    defaultSide: z.enum(CHARACTER_SIDES).nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CharacterCreateRequest");

export const UpdateCharacterSchema = CreateCharacterSchema.partial().openapi(
  "CharacterUpdateRequest",
);

export type CreateCharacterInput = z.input<typeof CreateCharacterSchema>;
export type UpdateCharacterInput = z.input<typeof UpdateCharacterSchema>;

export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});

export const CharacterResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    portraitUrl: z.string().nullable(),
    defaultSide: z.enum(CHARACTER_SIDES).nullable(),
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Character");

export const CharacterListResponseSchema = pageOf(CharacterResponseSchema).openapi(
  "CharacterList",
);
