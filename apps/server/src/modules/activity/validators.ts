import { z } from "@hono/zod-openapi";

import {
  ACTION_TYPES,
  ACTIVITY_KINDS,
  ACTIVITY_MEMBER_STATUSES,
  ACTIVITY_QUEUE_FORMATS,
  ACTIVITY_VISIBILITIES,
  CLEANUP_MODES,
  NODE_TYPES,
  TRIGGER_KINDS,
} from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const RewardEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string().min(1),
  count: z.number().int().positive(),
});

const CleanupRuleSchema = z.object({
  mode: z.enum(CLEANUP_MODES),
  conversionMap: z
    .record(z.string(), z.array(RewardEntrySchema))
    .optional(),
});

const NodeUnlockRuleSchema = z.object({
  requirePrevNodeAliases: z.array(z.string()).optional(),
  minActivityPoints: z.number().int().nonnegative().optional(),
  notBefore: z.string().datetime().optional(),
  relativeToStartSeconds: z.number().int().optional(),
});

export const MembershipConfigSchema = z
  .object({
    leaveAllowed: z.boolean().optional(),
    queue: z
      .object({
        enabled: z.boolean(),
        format: z.enum(ACTIVITY_QUEUE_FORMATS),
        length: z.number().int().min(4).max(8),
      })
      .optional(),
  })
  .openapi("ActivityMembershipConfig");

export const CreateActivitySchema = z
  .object({
    alias: z.string().min(1).max(64).regex(AliasRegex),
    name: z.string().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    bannerImage: z.string().max(1024).nullable().optional(),
    themeColor: z.string().max(32).nullable().optional(),
    kind: z.enum(ACTIVITY_KINDS).default("generic").optional(),
    visibleAt: z.string().datetime(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    hiddenAt: z.string().datetime(),
    timezone: z.string().min(1).max(64).default("UTC").optional(),
    globalRewards: z.array(RewardEntrySchema).default([]).optional(),
    cleanupRule: CleanupRuleSchema.default({ mode: "purge" }).optional(),
    joinRequirement: z.record(z.string(), z.unknown()).nullable().optional(),
    visibility: z.enum(ACTIVITY_VISIBILITIES).default("public").optional(),
    templateId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    membership: MembershipConfigSchema.nullable().optional(),
  })
  .openapi("ActivityCreate");

export const UpdateActivitySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    bannerImage: z.string().max(1024).nullable().optional(),
    themeColor: z.string().max(32).nullable().optional(),
    visibleAt: z.string().datetime().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    hiddenAt: z.string().datetime().optional(),
    timezone: z.string().min(1).max(64).optional(),
    globalRewards: z.array(RewardEntrySchema).optional(),
    cleanupRule: CleanupRuleSchema.optional(),
    joinRequirement: z.record(z.string(), z.unknown()).nullable().optional(),
    visibility: z.enum(ACTIVITY_VISIBILITIES).optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    membership: MembershipConfigSchema.nullable().optional(),
  })
  .openapi("ActivityUpdate");

export const PublishActivitySchema = z
  .object({
    action: z.enum(["publish", "unpublish", "archive"]),
  })
  .openapi("ActivityPublishAction");

export const CreateNodeSchema = z
  .object({
    alias: z.string().min(1).max(64).regex(AliasRegex),
    nodeType: z.enum(NODE_TYPES),
    refId: z.string().uuid().nullable().optional(),
    orderIndex: z.number().int().default(0).optional(),
    unlockRule: NodeUnlockRuleSchema.nullable().optional(),
    nodeConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    enabled: z.boolean().default(true).optional(),
  })
  .openapi("ActivityCreateNode");

export const UpdateNodeSchema = z
  .object({
    orderIndex: z.number().int().optional(),
    unlockRule: NodeUnlockRuleSchema.nullable().optional(),
    nodeConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    enabled: z.boolean().optional(),
    refId: z.string().uuid().nullable().optional(),
  })
  .openapi("ActivityUpdateNode");

export const CreateScheduleSchema = z
  .object({
    alias: z.string().min(1).max(64).regex(AliasRegex),
    triggerKind: z.enum(TRIGGER_KINDS),
    fireAt: z.string().datetime().nullable().optional(),
    offsetFrom: z
      .enum(["visible_at", "start_at", "end_at", "hidden_at"])
      .nullable()
      .optional(),
    offsetSeconds: z.number().int().nullable().optional(),
    cronExpr: z.string().nullable().optional(),
    actionType: z.enum(ACTION_TYPES),
    actionConfig: z.record(z.string(), z.unknown()).default({}).optional(),
    enabled: z.boolean().default(true).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.triggerKind === "once_at" && !val.fireAt) {
      ctx.addIssue({
        code: "custom",
        path: ["fireAt"],
        message: "fireAt is required when triggerKind='once_at'",
      });
    }
    if (val.triggerKind === "relative_offset") {
      if (val.offsetSeconds === null || val.offsetSeconds === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["offsetSeconds"],
          message:
            "offsetSeconds is required when triggerKind='relative_offset'",
        });
      }
    }
    if (val.triggerKind === "cron" && !val.cronExpr) {
      ctx.addIssue({
        code: "custom",
        path: ["cronExpr"],
        message: "cronExpr is required when triggerKind='cron'",
      });
    }
  })
  .openapi("ActivityCreateSchedule");

export const JoinActivityBody = z
  .object({
    endUserId: z.string().min(1).max(256),
  })
  .openapi("ActivityJoin");

export const AddPointsBody = z
  .object({
    endUserId: z.string().min(1).max(256),
    delta: z.number().int(),
    source: z.string().min(1).max(128),
    sourceRef: z.string().max(256).optional(),
  })
  .openapi("ActivityAddPoints");

const DurationSpecSchema = z.object({
  teaseSeconds: z.number().int().nonnegative(),
  activeSeconds: z.number().int().positive(),
  hiddenSeconds: z.number().int().nonnegative(),
});

const RecurrenceSchema = z.union([
  z.object({
    mode: z.literal("weekly"),
    dayOfWeek: z.number().int().min(0).max(6),
    hourOfDay: z.number().int().min(0).max(23),
    timezone: z.string().min(1).max(64),
  }),
  z.object({
    mode: z.literal("monthly"),
    dayOfMonth: z.number().int().min(1).max(31),
    hourOfDay: z.number().int().min(0).max(23),
    timezone: z.string().min(1).max(64),
  }),
  z.object({ mode: z.literal("manual") }),
]);

const NodeBlueprintSchema = z.object({
  alias: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9\-_]*$/),
  nodeType: z.enum(NODE_TYPES),
  refIdStrategy: z.enum(["reuse_shared", "virtual", "manual_link"]),
  fixedRefId: z.string().uuid().nullable().optional(),
  orderIndex: z.number().int().default(0).optional(),
  unlockRule: z.record(z.string(), z.unknown()).nullable().optional(),
  nodeConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().default(true).optional(),
});

const ScheduleBlueprintSchema = z.object({
  alias: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9\-_]*$/),
  triggerKind: z.enum(TRIGGER_KINDS),
  fireAtOffsetSeconds: z.number().int().optional(),
  offsetFrom: z
    .enum(["visible_at", "start_at", "end_at", "reward_end_at", "hidden_at"])
    .optional(),
  offsetSeconds: z.number().int().optional(),
  cronExpr: z.string().optional(),
  actionType: z.enum(ACTION_TYPES),
  actionConfig: z.record(z.string(), z.unknown()).default({}).optional(),
  enabled: z.boolean().default(true).optional(),
});

const CurrencyBlueprintSchema = z.object({
  aliasPattern: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(256).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ItemDefinitionBlueprintSchema = z.object({
  aliasPattern: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(256).nullable().optional(),
  categoryAlias: z.string().max(64).nullable().optional(),
  stackable: z.boolean().optional(),
  stackLimit: z.number().int().positive().nullable().optional(),
  holdLimit: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const EntityBlueprintBlueprintSchema = z.object({
  aliasPattern: z.string().min(1).max(128),
  schemaAlias: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(256).nullable().optional(),
  rarity: z.string().max(32).nullable().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  assets: z.record(z.string(), z.string()).optional(),
  baseStats: z.record(z.string(), z.number()).optional(),
  statGrowth: z.record(z.string(), z.number()).optional(),
  maxLevel: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const CreateActivityTemplateBody = z
  .object({
    alias: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9\-_]*$/),
    name: z.string().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    templatePayload: z.record(z.string(), z.unknown()),
    durationSpec: DurationSpecSchema,
    recurrence: RecurrenceSchema,
    aliasPattern: z.string().min(1).max(128),
    nodesBlueprint: z.array(NodeBlueprintSchema).default([]).optional(),
    schedulesBlueprint: z.array(ScheduleBlueprintSchema).default([]).optional(),
    currenciesBlueprint: z
      .array(CurrencyBlueprintSchema)
      .default([])
      .optional(),
    itemDefinitionsBlueprint: z
      .array(ItemDefinitionBlueprintSchema)
      .default([])
      .optional(),
    entityBlueprintsBlueprint: z
      .array(EntityBlueprintBlueprintSchema)
      .default([])
      .optional(),
    autoPublish: z.boolean().default(false).optional(),
    enabled: z.boolean().default(true).optional(),
  })
  .openapi("ActivityTemplateCreate");

export const KeyParam = z.object({
  key: z.string().min(1).openapi({ param: { name: "key", in: "path" } }),
});

export const IdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const ActivityConfigResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    bannerImage: z.string().nullable(),
    themeColor: z.string().nullable(),
    kind: z.enum(ACTIVITY_KINDS),
    visibleAt: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    hiddenAt: z.string(),
    timezone: z.string(),
    status: z.string(),
    globalRewards: z.array(RewardEntrySchema),
    cleanupRule: CleanupRuleSchema,
    joinRequirement: z.record(z.string(), z.unknown()).nullable(),
    visibility: z.enum(ACTIVITY_VISIBILITIES),
    templateId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    membership: MembershipConfigSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Activity");

// ─── Member ops (leave / list / redeem queue) ──────────────────

export const LeaveActivityBody = z
  .object({
    endUserId: z.string().min(1).max(256),
  })
  .openapi("ActivityLeave");

export const EndUserIdParam = z.object({
  endUserId: z
    .string()
    .min(1)
    .openapi({ param: { name: "endUserId", in: "path" } }),
});

export const MembersQuerySchema = z.object({
  status: z
    .enum([...ACTIVITY_MEMBER_STATUSES, "all"])
    .default("all")
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
});

export const MemberRowSchema = z
  .object({
    endUserId: z.string(),
    status: z.enum(ACTIVITY_MEMBER_STATUSES),
    joinedAt: z.string(),
    lastActiveAt: z.string(),
    completedAt: z.string().nullable(),
    leftAt: z.string().nullable(),
    queueNumber: z.string().nullable(),
    queueNumberUsedAt: z.string().nullable(),
    activityPoints: z.number().int(),
  })
  .openapi("ActivityMember");

export const MemberListResponseSchema = z
  .object({
    items: z.array(MemberRowSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("ActivityMemberList");

export const RedeemQueueResponseSchema = z
  .object({
    endUserId: z.string(),
    queueNumber: z.string(),
    usedAt: z.string(),
  })
  .openapi("ActivityRedeemQueueResult");

export const JoinActivityResponseSchema = z
  .object({
    id: z.string(),
    activityId: z.string(),
    endUserId: z.string(),
    status: z.enum(ACTIVITY_MEMBER_STATUSES),
    joinedAt: z.string(),
    lastActiveAt: z.string(),
    activityPoints: z.number().int(),
    queueNumber: z.string().nullable(),
    queueNumberUsedAt: z.string().nullable(),
    leftAt: z.string().nullable(),
  })
  .openapi("ActivityJoinResult");

export type CreateActivityInput = z.input<typeof CreateActivitySchema>;
export type UpdateActivityInput = z.input<typeof UpdateActivitySchema>;
export type CreateNodeInput = z.input<typeof CreateNodeSchema>;
export type UpdateNodeInput = z.input<typeof UpdateNodeSchema>;
export type CreateScheduleInput = z.input<typeof CreateScheduleSchema>;
export type MembershipConfigInput = z.input<typeof MembershipConfigSchema>;
