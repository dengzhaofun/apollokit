import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { LinkActionSchema } from "../link/validators";

const AliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, {
    message: "alias must be lowercase alphanumeric plus '-' or '_'",
  });

const ItemEntrySchema = z.object({
  definitionId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const NodeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/i, {
    message: "node id must be alphanumeric plus '-' or '_'",
  });

/**
 * Authored speaker. Either `characterId` (reference to
 * character_definitions) or `name` (inline) must be present — one is
 * required, both may coexist (e.g. override the character's display
 * name for this line), but at least one must resolve to a non-empty
 * display name.
 */
const SpeakerSchema = z
  .object({
    characterId: z.string().uuid().optional(),
    name: z.string().min(1).max(128).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
    side: z.enum(["left", "right"]),
  })
  .refine((s) => Boolean(s.characterId) || Boolean(s.name), {
    message: "speaker must have either characterId or inline name",
    path: ["name"],
  });

/**
 * Shape of the speaker delivered on the client-side node view — server
 * resolves `characterId` before serialization so `name` is always
 * present on the wire.
 */
const ClientSpeakerSchema = z.object({
  name: z.string(),
  avatarUrl: z.string().optional(),
  side: z.enum(["left", "right"]),
});

const OptionSchema = z.object({
  id: NodeIdSchema,
  label: z.string().min(1).max(500),
  next: NodeIdSchema.optional(),
  action: LinkActionSchema.optional(),
  rewards: z.array(ItemEntrySchema).optional(),
});

const NodeSchema = z.object({
  id: NodeIdSchema,
  speaker: SpeakerSchema,
  content: z.string().min(1).max(4000),
  next: NodeIdSchema.optional(),
  options: z.array(OptionSchema).max(10).optional(),
  onEnter: z
    .object({
      rewards: z.array(ItemEntrySchema).optional(),
    })
    .optional(),
});

const TriggerConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({ kind: z.literal("onLogin") }),
  z.object({
    kind: z.literal("onScriptComplete"),
    scriptAlias: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("onLevel"),
    minLevel: z.number().int().min(1),
  }),
]);

// ─── Admin — script CRUD ───────────────────────────────────────

export const CreateDialogueScriptSchema = z
  .object({
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    startNodeId: NodeIdSchema,
    nodes: z.array(NodeSchema).min(1).max(200),
    triggerCondition: TriggerConditionSchema.nullable().optional(),
    repeatable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("DialogueScriptCreateRequest");

export const UpdateDialogueScriptSchema =
  CreateDialogueScriptSchema.partial().openapi("DialogueScriptUpdateRequest");

export type CreateDialogueScriptInput = z.input<
  typeof CreateDialogueScriptSchema
>;
export type UpdateDialogueScriptInput = z.input<
  typeof UpdateDialogueScriptSchema
>;

// ─── Client — advance body ──────────────────────────────────────

export const AdvanceDialogueSchema = z
  .object({
    optionId: NodeIdSchema.optional(),
  })
  .openapi("DialogueAdvanceRequest");

// ─── Params ─────────────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
  }),
});

export const AliasParamSchema = z.object({
  alias: AliasSchema.openapi({
    param: { name: "alias", in: "path" },
  }),
});

// ─── Responses ─────────────────────────────────────────────────

const AdminDialogueNodeSchema = NodeSchema.openapi("DialogueNode");

export const DialogueScriptResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    startNodeId: z.string(),
    nodes: z.array(AdminDialogueNodeSchema),
    triggerCondition: TriggerConditionSchema.nullable(),
    repeatable: z.boolean(),
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DialogueScript");

export const DialogueScriptListResponseSchema = pageOf(DialogueScriptResponseSchema).openapi(
  "DialogueScriptList",
);

const ClientOptionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    next: z.string().optional(),
    action: LinkActionSchema.optional(),
  })
  .openapi("ClientDialogueOption");

const ClientNodeSchema = z
  .object({
    id: z.string(),
    speaker: ClientSpeakerSchema,
    content: z.string(),
    next: z.string().optional(),
    options: z.array(ClientOptionSchema).optional(),
    isTerminal: z.boolean(),
  })
  .openapi("ClientDialogueNode");

const RewardGrantSchema = z
  .object({
    origin: z.enum(["enter", "option"]),
    nodeId: z.string(),
    optionId: z.string().optional(),
    rewards: z.array(ItemEntrySchema),
  })
  .openapi("DialogueRewardGrant");

export const DialogueSessionResponseSchema = z
  .object({
    scriptId: z.string(),
    scriptAlias: z.string(),
    currentNode: ClientNodeSchema.nullable(),
    historyPath: z.array(z.string()),
    completedAt: z.string().nullable(),
    grantedRewards: z.array(RewardGrantSchema),
  })
  .openapi("DialogueSession");

