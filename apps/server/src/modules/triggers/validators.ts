import { z } from "@hono/zod-openapi";

import { TRIGGER_RULE_STATUSES } from "./types";

const ActionSchema = z
  .object({
    type: z.enum([
      "emit_event",
      "grant_reward",
      "unlock_feature",
      "send_notification",
    ]),
  })
  .passthrough()
  .openapi("TriggerAction");

const ThrottleSchema = z
  .object({
    perUserPerMinute: z.number().int().positive().optional(),
    perUserPerHour: z.number().int().positive().optional(),
    perUserPerDay: z.number().int().positive().optional(),
    perOrgPerMinute: z.number().int().positive().optional(),
    perOrgPerHour: z.number().int().positive().optional(),
  })
  .openapi("TriggerThrottle");

export const CreateRuleSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    status: z.enum(TRIGGER_RULE_STATUSES).optional(),
    triggerEvent: z.string().min(1).max(120),
    condition: z.unknown().optional(),
    actions: z.array(ActionSchema).min(1),
    throttle: ThrottleSchema.nullable().optional(),
    graph: z.unknown().optional(),
  })
  .openapi("CreateTriggerRuleRequest");

export const UpdateRuleSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(TRIGGER_RULE_STATUSES).optional(),
    triggerEvent: z.string().min(1).max(120).optional(),
    condition: z.unknown().optional(),
    actions: z.array(ActionSchema).min(1).optional(),
    throttle: ThrottleSchema.nullable().optional(),
    graph: z.unknown().optional(),
    version: z.number().int().nonnegative(),
  })
  .openapi("UpdateTriggerRuleRequest");

export const DryRunSchema = z
  .object({
    /** Sample payload —— 任意 JSON 对象,触发引擎读取里面的 organizationId / endUserId / 自定义字段。 */
    payload: z.record(z.string(), z.unknown()),
  })
  .openapi("DryRunTriggerRuleRequest");

export const RuleIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("TriggerRuleIdParam");

const TriggerRuleResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.enum(TRIGGER_RULE_STATUSES),
    triggerEvent: z.string(),
    condition: z.unknown().nullable(),
    // 用 array(unknown) 让运行时类型与 jsonb 反推的 JSONValue[] 兼容；
    // ActionSchema 的 strict shape 通过 CreateRuleSchema 在创建时强制。
    actions: z.array(z.unknown()),
    throttle: ThrottleSchema.nullable(),
    graph: z.unknown().nullable(),
    version: z.number().int(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TriggerRule");

export const RuleResponseSchema = TriggerRuleResponseSchema;

export const RuleListResponseSchema = z
  .object({
    items: z.array(TriggerRuleResponseSchema),
  })
  .openapi("TriggerRuleListResponse");

const ActionResultSchema = z
  .object({
    type: z.string(),
    status: z.enum(["success", "failed", "skipped"]),
    durationMs: z.number().int(),
    error: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("TriggerActionResult");

export const EvaluateResultSchema = z
  .object({
    ruleId: z.string().uuid(),
    status: z.enum([
      "success",
      "partial",
      "failed",
      "throttled",
      "condition_failed",
    ]),
    conditionResult: z.boolean().nullable(),
    actionResults: z.array(ActionResultSchema),
  })
  .openapi("TriggerEvaluateResult");

export const DryRunResponseSchema = z
  .object({
    results: z.array(EvaluateResultSchema),
  })
  .openapi("DryRunResponse");

export const ListExecutionsQuerySchema = z
  .object({
    ruleId: z.string().uuid().optional(),
    status: z
      .enum([
        "success",
        "partial",
        "failed",
        "throttled",
        "condition_failed",
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .openapi("ListTriggerExecutionsQuery");

export const ExecutionResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    ruleId: z.string().uuid(),
    ruleVersion: z.number().int(),
    eventName: z.string(),
    endUserId: z.string().nullable(),
    traceId: z.string().nullable(),
    conditionResult: z.string().nullable(),
    actionResults: z.array(z.unknown()).nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    status: z.enum([
      "success",
      "partial",
      "failed",
      "throttled",
      "condition_failed",
    ]),
  })
  .openapi("TriggerExecution");

export const ExecutionListResponseSchema = z
  .object({
    items: z.array(ExecutionResponseSchema),
  })
  .openapi("TriggerExecutionListResponse");
