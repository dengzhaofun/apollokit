/**
 * Admin routes for the experiment module.
 *
 * Mounted at `/api/v1/experiment/*` in src/index.ts. All routes require an
 * admin session OR an admin API key (`ak_`); end-user (cpk_) routes
 * live in `client-routes.ts`.
 */

import { z } from "@hono/zod-openapi";

import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { PaginationQuerySchema } from "../../lib/pagination";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { experimentService } from "./index";
import type {
  Experiment,
  ExperimentAssignment,
  ExperimentStatus,
  ExperimentVariant,
} from "./types";
import { EXPERIMENT_STATUSES } from "./types";
import {
  AssignmentListResponseSchema,
  CreateExperimentSchema,
  CreateVariantSchema,
  ExperimentIdParamSchema,
  ExperimentKeyParamSchema,
  ExperimentListResponseSchema,
  ExperimentResponseSchema,
  PreviewBucketingRequestSchema,
  PreviewBucketingResponseSchema,
  PrimaryMetricSchema,
  TransitionStatusSchema,
  UpdateExperimentSchema,
  UpdateVariantSchema,
  VariantIdParamSchema,
  VariantListResponseSchema,
  VariantMoveSchema,
  VariantResponseSchema,
} from "./validators";

const TAG = "Experiment";

// ─── Serializers (Date → ISO; jsonb columns are pre-parsed) ──────

function serializeExperiment(
  row: Experiment & { variantsCount?: number; assignedUsers?: number },
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status as ExperimentStatus,
    trafficAllocation: row.trafficAllocation,
    controlVariantKey: row.controlVariantKey,
    targetingRules: row.targetingRules,
    primaryMetric: row.primaryMetric ?? null,
    metricWindowDays: row.metricWindowDays,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    variantsCount: row.variantsCount,
    assignedUsers: row.assignedUsers,
  };
}

function serializeVariant(
  row: ExperimentVariant & { assignedUsers?: number },
) {
  return {
    id: row.id,
    experimentId: row.experimentId,
    tenantId: row.tenantId,
    variantKey: row.variantKey,
    name: row.name,
    description: row.description,
    isControl: row.isControl,
    configJson: row.configJson ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignedUsers: row.assignedUsers,
  };
}

function serializeAssignment(row: ExperimentAssignment) {
  return {
    experimentId: row.experimentId,
    endUserId: row.endUserId,
    tenantId: row.tenantId,
    variantId: row.variantId,
    variantKey: row.variantKey,
    assignedAt: row.assignedAt.toISOString(),
  };
}

export const experimentRouter = createAdminRouter();

experimentRouter.use("*", requireTenantSessionOrApiKey);
experimentRouter.use("*", requirePermissionByMethod("experiment"));

// ─── Stats ──────────────────────────────────────────────────────

const ExperimentStatsSchema = z.object({
  draft: z.number(),
  running: z.number(),
  paused: z.number(),
  archived: z.number(),
});

experimentRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/experiments:stats",
    tags: [TAG],
    summary: "Count experiments by status",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentStatsSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const stats = await experimentService.getExperimentStats(orgId);
    return c.json(ok(stats), 200);
  },
);

// ─── Experiment CRUD ────────────────────────────────────────────

experimentRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/experiments",
    tags: [TAG],
    summary: "Create an experiment (status: draft)",
    request: {
      body: { content: { "application/json": { schema: CreateExperimentSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(ExperimentResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await experimentService.createExperiment(orgId, c.req.valid("json"));
    return c.json(ok(serializeExperiment(row)), 201);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/experiments",
    tags: [TAG],
    summary: "List experiments",
    request: {
      query: z.object({
        status: z
          .enum(EXPERIMENT_STATUSES)
          .optional()
          .openapi({ param: { name: "status", in: "query" } }),
        cursor: z
          .string()
          .optional()
          .openapi({ param: { name: "cursor", in: "query" } }),
        limit: z.coerce.number().int().min(1).max(200).optional().openapi({
          param: { name: "limit", in: "query" },
        }),
        q: z
          .string()
          .optional()
          .openapi({ param: { name: "q", in: "query" } }),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await experimentService.listExperiments(orgId, {
      status: q.status,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeExperiment), nextCursor: page.nextCursor }),
      200,
    );
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/experiments/{key}",
    tags: [TAG],
    summary: "Fetch an experiment by id or key",
    request: { params: ExperimentKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await experimentService.getExperiment(orgId, key);
    return c.json(ok(serializeExperiment(row)), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/experiments/{id}",
    tags: [TAG],
    summary: "Update an experiment (locked fields rejected while running)",
    request: {
      params: ExperimentIdParamSchema,
      body: { content: { "application/json": { schema: UpdateExperimentSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await experimentService.updateExperiment(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeExperiment(row)), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/experiments/{id}",
    tags: [TAG],
    summary: "Delete an experiment (only draft / archived)",
    request: { params: ExperimentIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await experimentService.deleteExperiment(orgId, id);
    return c.json(ok(null), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/experiments/{id}:transition",
    tags: [TAG],
    summary: "Transition the experiment status (draft↔running↔paused↔archived)",
    request: {
      params: ExperimentIdParamSchema,
      body: { content: { "application/json": { schema: TransitionStatusSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const { to } = c.req.valid("json");
    const row = await experimentService.transitionStatus(orgId, id, to);
    return c.json(ok(serializeExperiment(row)), 200);
  },
);

// ─── Variants ───────────────────────────────────────────────────

experimentRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/experiments/{key}/variants",
    tags: [TAG],
    summary: "List variants of an experiment",
    request: { params: ExperimentKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(VariantListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const rows = await experimentService.listVariants(orgId, key);
    return c.json(ok({ items: rows.map(serializeVariant) }), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/experiments/{key}/variants",
    tags: [TAG],
    summary: "Create a variant on an experiment (locked while running)",
    request: {
      params: ExperimentKeyParamSchema,
      body: { content: { "application/json": { schema: CreateVariantSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(VariantResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await experimentService.createVariant(orgId, key, c.req.valid("json"));
    return c.json(ok(serializeVariant(row)), 201);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/variants/{id}",
    tags: [TAG],
    summary: "Update a variant",
    request: {
      params: VariantIdParamSchema,
      body: { content: { "application/json": { schema: UpdateVariantSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(VariantResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await experimentService.updateVariant(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeVariant(row)), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/variants/{id}",
    tags: [TAG],
    summary: "Delete a variant (rejected if assigned to any user)",
    request: { params: VariantIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await experimentService.deleteVariant(orgId, id);
    return c.json(ok(null), 200);
  },
);

experimentRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/variants/{id}/move",
    tags: [TAG],
    summary: "Reorder a variant within its experiment",
    request: {
      params: VariantIdParamSchema,
      body: { content: { "application/json": { schema: VariantMoveSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(VariantResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await experimentService.moveVariant(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeVariant(row)), 200);
  },
);

// ─── Assignments (debug / admin) ───────────────────────────────

experimentRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/experiments/{key}/assignments",
    tags: [TAG],
    summary: "List per-user assignments for an experiment (debug)",
    request: { params: ExperimentKeyParamSchema, query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssignmentListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const page = await experimentService.listAssignments(orgId, key, {
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeAssignment), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// ─── Primary metric (v1.5) ─────────────────────────────────────

experimentRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/experiments/{id}/primary-metric",
    tags: [TAG],
    summary:
      "Set / clear the experiment's primary metric (used by the decision panel)",
    request: {
      params: ExperimentIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              primaryMetric: PrimaryMetricSchema.nullable(),
              metricWindowDays: z.number().int().min(1).max(30).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ExperimentResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await experimentService.setPrimaryMetric(
      orgId,
      id,
      body.primaryMetric,
      body.metricWindowDays,
    );
    return c.json(ok(serializeExperiment(row)), 200);
  },
);

// ─── Bucketing preview ─────────────────────────────────────────

experimentRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/experiments/{key}/preview-bucketing",
    tags: [TAG],
    summary:
      "Preview bucketing for an experiment — single-user lookup + sampled distribution",
    request: {
      params: ExperimentKeyParamSchema,
      body: {
        content: { "application/json": { schema: PreviewBucketingRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PreviewBucketingResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await experimentService.previewBucketing(orgId, key, body);
    return c.json(ok(result), 200);
  },
);
