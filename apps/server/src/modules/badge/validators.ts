import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";

import {
  BADGE_AGGREGATIONS,
  BADGE_DISMISS_MODES,
  BADGE_DISPLAY_TYPES,
  BADGE_SIGNAL_MATCH_MODES,
} from "../../schema/badge";
import { BADGE_SIGNAL_MODES } from "./types";

// Dot-notation key, e.g. "home.mail.inbox". Length capped at 200.
const NodeKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/i, {
    message:
      "key must be dot-separated segments of [a-zA-Z0-9_] (e.g. 'home.mail.inbox')",
  });

// Signal keys are customer-defined — lenient. We still refuse obvious
// abuse (spaces / newlines / pathological length).
const SignalKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s]+$/, { message: "signalKey must not contain whitespace" });

const SignalKeyPrefixSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s]+$/, {
    message: "signalKeyPrefix must not contain whitespace",
  });

// ─── Admin: node CRUD ────────────────────────────────────────────

export const CreateNodeSchema = z
  .object({
    key: NodeKeySchema.openapi({ example: "home.mail.inbox" }),
    parentKey: NodeKeySchema.nullable().optional(),
    displayType: z.enum(BADGE_DISPLAY_TYPES),
    displayLabelKey: z.string().min(1).max(200).nullable().optional(),
    signalMatchMode: z.enum(BADGE_SIGNAL_MATCH_MODES),
    signalKey: SignalKeySchema.nullable().optional(),
    signalKeyPrefix: SignalKeyPrefixSchema.nullable().optional(),
    aggregation: z.enum(BADGE_AGGREGATIONS).default("none"),
    dismissMode: z.enum(BADGE_DISMISS_MODES).default("auto"),
    dismissConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    visibilityRule: z.record(z.string(), z.unknown()).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .openapi("BadgeNodeCreateRequest");

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

export const UpdateNodeSchema = z
  .object({
    parentKey: NodeKeySchema.nullable().optional(),
    displayType: z.enum(BADGE_DISPLAY_TYPES).optional(),
    displayLabelKey: z.string().min(1).max(200).nullable().optional(),
    signalMatchMode: z.enum(BADGE_SIGNAL_MATCH_MODES).optional(),
    signalKey: SignalKeySchema.nullable().optional(),
    signalKeyPrefix: SignalKeyPrefixSchema.nullable().optional(),
    aggregation: z.enum(BADGE_AGGREGATIONS).optional(),
    dismissMode: z.enum(BADGE_DISMISS_MODES).optional(),
    dismissConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    visibilityRule: z.record(z.string(), z.unknown()).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi("BadgeNodeUpdateRequest");

export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

export const NodeIdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});

export const NodeKeyParamSchema = z.object({
  key: NodeKeySchema.openapi({ param: { name: "key", in: "path" } }),
});

// ─── Node response ────────────────────────────────────────────────

export const BadgeNodeResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    key: z.string(),
    parentKey: z.string().nullable(),
    displayType: z.string(),
    displayLabelKey: z.string().nullable(),
    signalMatchMode: z.string(),
    signalKey: z.string().nullable(),
    signalKeyPrefix: z.string().nullable(),
    aggregation: z.string(),
    dismissMode: z.string(),
    dismissConfig: z.record(z.string(), z.unknown()).nullable(),
    visibilityRule: z.record(z.string(), z.unknown()).nullable(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("BadgeNode");

export const BadgeNodeListResponseSchema = z
  .object({ items: z.array(BadgeNodeResponseSchema) })
  .openapi("BadgeNodeList");

// ─── Signal write (admin / SDK) ───────────────────────────────────

export const SignalInputSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    signalKey: SignalKeySchema,
    mode: z.enum(BADGE_SIGNAL_MODES),
    count: z.number().int().optional(),
    version: z.string().max(200).nullable().optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
    tooltipKey: z.string().max(200).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .openapi("BadgeSignalInput");

export const SignalBatchInputSchema = z
  .object({
    inputs: z.array(SignalInputSchema).min(1).max(500),
  })
  .openapi("BadgeSignalBatchInput");

export const SignalWriteResponseSchema = z
  .object({
    endUserId: z.string(),
    signalKey: z.string(),
    count: z.number().int(),
    version: z.string().nullable(),
    firstAppearedAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi("BadgeSignalWriteResult");

export const SignalBatchResponseSchema = z
  .object({
    results: z.array(SignalWriteResponseSchema),
  })
  .openapi("BadgeSignalBatchResult");

// ─── Client /tree ─────────────────────────────────────────────────

export const TreeQuerySchema = z.object({
  rootKey: NodeKeySchema.optional().openapi({
    param: { name: "rootKey", in: "query" },
    description:
      "Limit the returned tree to the subtree rooted at this node. Omit for the full tree.",
  }),
});

const BaseTreeNodeFields = {
  key: z.string(),
  displayType: z.string(),
  displayLabelKey: z.string().nullable(),
  count: z.number().int(),
  version: z.string().nullable(),
  firstAppearedAt: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  tooltipKey: z.string().nullable(),
};

// Recursive schema — Zod needs a lazy wrapper. Explain block is optional.
export type BadgeTreeNodeShape = {
  key: string;
  displayType: string;
  displayLabelKey: string | null;
  count: number;
  version: string | null;
  firstAppearedAt: string | null;
  meta: Record<string, unknown> | null;
  tooltipKey: string | null;
  children: BadgeTreeNodeShape[];
  explain?: unknown;
};

export const BadgeTreeNodeSchema: z.ZodType<BadgeTreeNodeShape> = z.lazy(() =>
  z
    .object({
      ...BaseTreeNodeFields,
      children: z.array(BadgeTreeNodeSchema),
      explain: z.record(z.string(), z.unknown()).optional(),
    })
    .openapi("BadgeTreeNode"),
);

export const TreeResponseSchema = z
  .object({
    rootKey: z.string().nullable(),
    serverTimestamp: z.string(),
    nodes: z.array(BadgeTreeNodeSchema),
  })
  .openapi("BadgeTreeResponse");

// ─── Client /dismiss ──────────────────────────────────────────────

export const DismissInputSchema = z
  .object({
    nodeKey: NodeKeySchema,
    version: z.string().max(200).nullable().optional(),
  })
  .openapi("BadgeDismissInput");

export const DismissResponseSchema = z
  .object({
    nodeKey: z.string(),
    dismissedAt: z.string(),
    dismissedVersion: z.string().nullable(),
  })
  .openapi("BadgeDismissResult");

// ─── Signal registry ──────────────────────────────────────────────

export const SignalRegistryUpsertSchema = z
  .object({
    keyPattern: z.string().min(1).max(255).regex(/^[^\s]+$/),
    isDynamic: z.boolean().default(false),
    label: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    exampleMeta: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("BadgeSignalRegistryUpsert");

export const SignalRegistryResponseSchema = z
  .object({
    organizationId: z.string(),
    keyPattern: z.string(),
    isDynamic: z.boolean(),
    label: z.string(),
    description: z.string().nullable(),
    exampleMeta: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("BadgeSignalRegistryEntry");

export const SignalRegistryListResponseSchema = z
  .object({
    items: z.array(SignalRegistryResponseSchema),
  })
  .openapi("BadgeSignalRegistryList");

export const KeyPatternParamSchema = z.object({
  keyPattern: z.string().min(1).max(255).openapi({
    param: { name: "keyPattern", in: "path" },
  }),
});

// ─── Templates ────────────────────────────────────────────────────

export const TemplateListResponseSchema = z
  .object({
    templates: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        displayType: z.string(),
        aggregation: z.string(),
        dismissMode: z.string(),
        signalMatchMode: z.string(),
        requires: z.array(z.enum(["signalKey", "signalKeyPrefix"])),
      }),
    ),
  })
  .openapi("BadgeTemplateList");

export const FromTemplateInputSchema = z
  .object({
    templateId: z.string().min(1).max(100),
    key: NodeKeySchema,
    parentKey: NodeKeySchema.nullable().optional(),
    displayLabelKey: z.string().max(200).nullable().optional(),
    signalKey: SignalKeySchema.nullable().optional(),
    signalKeyPrefix: SignalKeyPrefixSchema.nullable().optional(),
  })
  .openapi("BadgeFromTemplateInput");

// ─── Preview / Inspector ─────────────────────────────────────────

export const PreviewInputSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    rootKey: NodeKeySchema.nullable().optional(),
    explain: z.boolean().default(true),
  })
  .openapi("BadgePreviewInput");

export const PreviewResponseSchema = z
  .object({
    rootKey: z.string().nullable(),
    serverTimestamp: z.string(),
    nodes: z.array(BadgeTreeNodeSchema),
    rawSignals: z.array(
      z.object({
        signalKey: z.string(),
        count: z.number().int(),
        version: z.string().nullable(),
        firstAppearedAt: z.string().nullable(),
        expiresAt: z.string().nullable(),
        meta: z.record(z.string(), z.unknown()).nullable(),
        updatedAt: z.string(),
      }),
    ),
    rawDismissals: z.array(
      z.object({
        nodeKey: z.string(),
        dismissedAt: z.string(),
        dismissedVersion: z.string().nullable(),
        periodKey: z.string().nullable(),
        sessionId: z.string().nullable(),
      }),
    ),
  })
  .openapi("BadgePreviewResponse");

// ─── Validate tree ────────────────────────────────────────────────

export const ValidateTreeResponseSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(
      z.object({
        kind: z.enum(["cycle", "dangling_parent", "invalid_binding"]),
        nodeKey: z.string(),
        message: z.string(),
      }),
    ),
  })
  .openapi("BadgeValidateTreeResponse");
