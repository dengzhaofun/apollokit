/**
 * Admin-facing HTTP routes for the badge (red-dot) module.
 *
 * Two surfaces share this router:
 *
 *   1. **Operator routes** (node CRUD, signal-registry CRUD, preview,
 *      templates, validate-tree) — used by the customer's backoffice
 *      dashboard when configuring the tree.
 *
 *   2. **SDK / server-to-server signal writes** (`POST /signal` and
 *      `/signal/batch`) — called by the customer's game server to push
 *      counter updates. Authenticated as admin because this is a
 *      server-side trust boundary; client `cpk_` keys are not accepted
 *      here to avoid a tampered game client inflating the player's
 *      own counters.
 *
 * Both surfaces share `requireAdminOrApiKey + requireOrgManage`. The
 * key difference with other admin routes is that the signal writes
 * accept `endUserId` in the body — this is a trusted identity push,
 * not a self-service action for the logged-in admin.
 */

import type { HonoEnv } from "../../env";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
import { badgeService } from "./index";
import {
  BadgeNodeListResponseSchema,
  BadgeNodeResponseSchema,
  CreateNodeSchema,
  DismissInputSchema,
  FromTemplateInputSchema,
  NodeIdParamSchema,
  PreviewInputSchema,
  PreviewResponseSchema,
  SignalBatchInputSchema,
  SignalBatchResponseSchema,
  SignalInputSchema,
  SignalRegistryListResponseSchema,
  SignalRegistryResponseSchema,
  SignalRegistryUpsertSchema,
  SignalWriteResponseSchema,
  KeyPatternParamSchema,
  TemplateListResponseSchema,
  UpdateNodeSchema,
  ValidateTreeResponseSchema,
} from "./validators";

const TAG = "Badge (Admin)";

export const badgeRouter = createAdminRouter();
badgeRouter.use("*", requireAdminOrApiKey);
badgeRouter.use("*", requireOrgManage);

// ─── Node CRUD ────────────────────────────────────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/nodes",
    tags: [TAG],
    summary: "List all badge nodes for the active org",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BadgeNodeListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await badgeService.listNodes(orgId);
    return c.json(
      ok({ items: rows.map(badgeService._serializeNode) }),
      200,
    );
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/nodes",
    tags: [TAG],
    summary: "Create a badge node",
    request: {
      body: {
        content: { "application/json": { schema: CreateNodeSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(BadgeNodeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await badgeService.createNode(orgId, input);
    return c.json(ok(badgeService._serializeNode(row)), 201);
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/nodes/{id}",
    tags: [TAG],
    summary: "Update a badge node",
    request: {
      params: NodeIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateNodeSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(BadgeNodeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await badgeService.updateNode(orgId, id, input);
    return c.json(ok(badgeService._serializeNode(row)), 200);
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/nodes/{id}",
    tags: [TAG],
    summary: "Soft-delete a badge node and all descendants",
    request: { params: NodeIdParamSchema },
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
    await badgeService.deleteNode(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Tree validate ────────────────────────────────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/nodes/validate-tree",
    tags: [TAG],
    summary: "Validate the node tree (cycles, dangling parents, bindings)",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(ValidateTreeResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const result = await badgeService.validateTree(orgId);
    return c.json(ok(result), 200);
  },
);

// ─── Templates ────────────────────────────────────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/templates",
    tags: [TAG],
    summary: "List built-in node templates",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(TemplateListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const templates = badgeService.listTemplates();
    return c.json(ok({ templates }), 200);
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/nodes/from-template",
    tags: [TAG],
    summary: "Create a node from a built-in template",
    request: {
      body: {
        content: {
          "application/json": { schema: FromTemplateInputSchema },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(BadgeNodeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await badgeService.createFromTemplate(orgId, input);
    return c.json(ok(badgeService._serializeNode(row)), 201);
  },
);

// ─── Signal write (SDK / server-to-server) ───────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/signal",
    tags: [TAG],
    summary: "Push a single badge signal for an end user",
    description:
      "Customer's game server UPSERTs a signal counter. signalKey is customer-defined and may be dynamic (e.g. `mail.inbox.abc123`). Modes: set | add | clear.",
    request: {
      body: { content: { "application/json": { schema: SignalInputSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(SignalWriteResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await badgeService.signal(orgId, {
      endUserId: input.endUserId,
      signalKey: input.signalKey,
      mode: input.mode,
      count: input.count,
      version: input.version ?? null,
      meta: input.meta ?? null,
      tooltipKey: input.tooltipKey ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return c.json(ok(badgeService._serializeSignalWrite(row)), 200);
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/signal/batch",
    tags: [TAG],
    summary: "Push a batch of badge signals (max 500 per call)",
    request: {
      body: {
        content: {
          "application/json": { schema: SignalBatchInputSchema },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(SignalBatchResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { inputs } = c.req.valid("json");
    const rows = await badgeService.signalBatch(
      orgId,
      inputs.map((i) => ({
        endUserId: i.endUserId,
        signalKey: i.signalKey,
        mode: i.mode,
        count: i.count,
        version: i.version ?? null,
        meta: i.meta ?? null,
        tooltipKey: i.tooltipKey ?? null,
        expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
      })),
    );
    return c.json(
      ok({ results: rows.map(badgeService._serializeSignalWrite) }),
      200,
    );
  },
);

// ─── Preview (Inspector) ─────────────────────────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/preview",
    tags: [TAG],
    summary:
      "Inspector: preview the tree for a specific endUserId with explain annotations",
    request: {
      body: {
        content: { "application/json": { schema: PreviewInputSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PreviewResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const result = await badgeService.preview(
      orgId,
      input.endUserId,
      input.rootKey ?? null,
      input.explain,
    );
    return c.json(ok(result), 200);
  },
);

// ─── Signal Registry ──────────────────────────────────────────────

badgeRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/signal-registry",
    tags: [TAG],
    summary: "List registered signalKey patterns (Admin UI dropdown source)",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(SignalRegistryListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await badgeService.listSignalRegistry(orgId);
    return c.json(
      ok({ items: rows.map(badgeService._serializeRegistry) }),
      200,
    );
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/signal-registry",
    tags: [TAG],
    summary: "Upsert a signalKey pattern into the registry",
    request: {
      body: {
        content: {
          "application/json": { schema: SignalRegistryUpsertSchema },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(SignalRegistryResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await badgeService.upsertSignalRegistry(orgId, input);
    return c.json(ok(badgeService._serializeRegistry(row)), 200);
  },
);

badgeRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/signal-registry/{keyPattern}",
    tags: [TAG],
    summary: "Remove a signalKey pattern from the registry",
    request: { params: KeyPatternParamSchema },
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
    const { keyPattern } = c.req.valid("param");
    await badgeService.deleteSignalRegistry(orgId, keyPattern);
    return c.json(ok(null), 200);
  },
);

// Re-export input schemas referenced elsewhere (currently unused but
// consistent with other admin routers).
export { DismissInputSchema };
