/**
 * Admin-facing HTTP routes for the page module.
 *
 * Guarded by `requireTenantSessionOrApiKey` + `requirePermissionByMethod("page")`.
 * Mounts under `/api/v1/page` (see src/index.ts).
 *
 * Endpoint surface:
 *
 *   Projects
 *     GET    /                              — list
 *     POST   /                              — create
 *     GET    /{projectId}                   — get
 *     PATCH  /{projectId}                   — update
 *     DELETE /{projectId}                   — delete
 *
 *   Versions
 *     GET    /{projectId}/versions          — list
 *     POST   /{projectId}/versions          — propose draft
 *     GET    /{projectId}/versions/{vid}    — get
 *     POST   /{projectId}/versions/{vid}/preview-token  — sign preview JWT
 *     POST   /{projectId}/publish           — publish a version
 *     POST   /{projectId}/rollback          — rollback to a version
 *
 *   Conversations
 *     GET    /{projectId}/conversations     — replay AI chat history
 *     POST   /{projectId}/conversations     — append message (admin tool)
 *
 *   Templates (system-seeded, global)
 *     GET    /templates                     — list
 *     GET    /templates/{templateId}        — get
 */

import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { invalidateRuntimeCache, pageService } from "./index";
import type {
  PageAuthMode,
  PageConversationRole,
  PageFormSubmission,
  PageProject,
  PageProjectConversation,
  PageProjectStatus,
  PageProjectVersion,
  PageTemplate,
  PageVersionAuthorType,
} from "./types";
import {
  AppendConversationMessageSchema,
  CreatePageProjectSchema,
  ListConversationsQuerySchema,
  ListFormSubmissionsQuerySchema,
  ListProjectsQuerySchema,
  ListTemplatesQuerySchema,
  ListVersionsQuerySchema,
  PageConversationListResponseSchema,
  PageConversationResponseSchema,
  PageFormSubmissionListResponseSchema,
  PageProjectListResponseSchema,
  PageProjectResponseSchema,
  PageTemplateListResponseSchema,
  PageTemplateResponseSchema,
  PageVersionListResponseSchema,
  PageVersionResponseSchema,
  PreviewTokenResponseSchema,
  ProjectIdParamSchema,
  ProposePageDraftSchema,
  PublishVersionSchema,
  RollbackVersionSchema,
  TemplateIdParamSchema,
  UpdatePageProjectSchema,
  VersionIdParamSchema,
} from "./validators";

const TAG_PROJECT = "Page (Admin)";
const TAG_VERSION = "Page Version (Admin)";
const TAG_CONVERSATION = "Page Conversation (Admin)";
const TAG_TEMPLATE = "Page Template (Admin)";
const TAG_SUBMISSION = "Page Submission (Admin)";

// ─── Serializers ───────────────────────────────────────────────────

function serializeProject(row: PageProject) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    status: row.status as PageProjectStatus,
    authMode: row.authMode as PageAuthMode,
    clientCredentialId: row.clientCredentialId,
    boundModules: row.boundModules,
    publishedVersionId: row.publishedVersionId,
    settings: row.settings,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeVersion(row: PageProjectVersion) {
  return {
    id: row.id,
    projectId: row.projectId,
    versionNumber: row.versionNumber,
    label: row.label,
    schema: row.schema,
    parentVersionId: row.parentVersionId,
    authorType: row.authorType as PageVersionAuthorType,
    authorId: row.authorId,
    conversationMessageId: row.conversationMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeConversation(row: PageProjectConversation) {
  return {
    id: row.id,
    projectId: row.projectId,
    messageId: row.messageId,
    role: row.role as PageConversationRole,
    content: row.content,
    proposedVersionId: row.proposedVersionId,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeSubmission(row: PageFormSubmission) {
  return {
    id: row.id,
    projectId: row.projectId,
    pageId: row.pageId,
    blockId: row.blockId,
    endUserId: row.endUserId,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeTemplate(row: PageTemplate) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as
      | "checkin"
      | "shop"
      | "lottery"
      | "redeem"
      | "leaderboard"
      | "event"
      | "marketing"
      | "other",
    coverImageUrl: row.coverImageUrl,
    schema: row.schema,
    requiredModules: row.requiredModules,
    isOfficial: row.isOfficial,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Router ────────────────────────────────────────────────────────

export const pageRouter = createAdminRouter();

pageRouter.use("*", requireTenantSessionOrApiKey);
pageRouter.use("*", requirePermissionByMethod("page"));

// ─── Templates (mounted BEFORE /{projectId} to avoid path collision) ──

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/templates",
    tags: [TAG_TEMPLATE],
    summary: "List official page templates",
    request: { query: ListTemplatesQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageTemplateListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const filter = c.req.valid("query");
    const items = await pageService.listTemplates(filter);
    return c.json(ok({ items: items.map(serializeTemplate) }), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/templates/{templateId}",
    tags: [TAG_TEMPLATE],
    summary: "Get a single page template",
    request: { params: TemplateIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageTemplateResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { templateId } = c.req.valid("param");
    const row = await pageService.getTemplate(templateId);
    return c.json(ok(serializeTemplate(row)), 200);
  },
);

// ─── Projects ──────────────────────────────────────────────────────

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG_PROJECT],
    summary: "List page projects for the active org",
    request: { query: ListProjectsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageProjectListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const filter = c.req.valid("query");
    const page = await pageService.listProjects(orgId, filter);
    return c.json(
      ok({
        items: page.items.map(serializeProject),
        nextCursor: page.nextCursor,
      }),
      200,
    );
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/",
    tags: [TAG_PROJECT],
    summary: "Create a new page project",
    request: {
      body: {
        content: { "application/json": { schema: CreatePageProjectSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: envelopeOf(
              PageProjectResponseSchema.extend({
                initialVersion: PageVersionResponseSchema.nullable(),
              }),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const { project, initialVersion } = await pageService.createProject(
      orgId,
      input,
      c.var.user?.id ?? null,
    );
    return c.json(
      ok({
        ...serializeProject(project),
        initialVersion: initialVersion
          ? serializeVersion(initialVersion)
          : null,
      }),
      201,
    );
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{projectId}",
    tags: [TAG_PROJECT],
    summary: "Get a page project",
    request: { params: ProjectIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageProjectResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const row = await pageService.getProjectById(orgId, projectId);
    return c.json(ok(serializeProject(row)), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{projectId}",
    tags: [TAG_PROJECT],
    summary: "Update a page project",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdatePageProjectSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageProjectResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await pageService.updateProject(orgId, projectId, input);
    return c.json(ok(serializeProject(row)), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{projectId}",
    tags: [TAG_PROJECT],
    summary: "Delete a page project",
    request: { params: ProjectIdParamSchema },
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
    const { projectId } = c.req.valid("param");
    await pageService.deleteProject(orgId, projectId);
    return c.json(ok(null), 200);
  },
);

// ─── Versions ──────────────────────────────────────────────────────

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{projectId}/versions",
    tags: [TAG_VERSION],
    summary: "List versions of a page project",
    request: {
      params: ProjectIdParamSchema,
      query: ListVersionsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageVersionListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const filter = c.req.valid("query");
    const page = await pageService.listVersions(orgId, projectId, filter);
    return c.json(
      ok({
        items: page.items.map(serializeVersion),
        nextCursor: page.nextCursor,
      }),
      200,
    );
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{projectId}/versions",
    tags: [TAG_VERSION],
    summary:
      "Propose a new draft version (manual or AI-authored). Always appends — never mutates.",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: { "application/json": { schema: ProposePageDraftSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: envelopeOf(PageVersionResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await pageService.proposeDraft(
      orgId,
      projectId,
      input,
      c.var.user?.id ?? null,
    );
    return c.json(ok(serializeVersion(row)), 201);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{projectId}/versions/{versionId}",
    tags: [TAG_VERSION],
    summary: "Get a specific version snapshot",
    request: { params: VersionIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageVersionResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId, versionId } = c.req.valid("param");
    const row = await pageService.getVersion(orgId, projectId, versionId);
    return c.json(ok(serializeVersion(row)), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{projectId}/versions/{versionId}/preview-token",
    tags: [TAG_VERSION],
    summary:
      "Sign a short-lived preview JWT used by the admin iframe to render this draft on the pages worker.",
    request: { params: VersionIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PreviewTokenResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId, versionId } = c.req.valid("param");
    const { token, expiresAt } = await pageService.createPreviewToken(
      orgId,
      projectId,
      versionId,
    );
    return c.json(
      ok({
        token,
        projectId,
        versionId,
        expiresAt: expiresAt.toISOString(),
      }),
      200,
    );
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{projectId}/publish",
    tags: [TAG_VERSION],
    summary: "Publish a specific version (sets project.publishedVersionId).",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: { "application/json": { schema: PublishVersionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageProjectResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const { versionId } = c.req.valid("json");
    const row = await pageService.publishVersion(orgId, projectId, versionId);
    // Bust the runtime KV cache so the pages worker sees the new
    // schema on the very next request rather than waiting on the 60s
    // TTL. Best-effort — failure here doesn't fail the publish call.
    c.executionCtx.waitUntil(
      invalidateRuntimeCache(row.slug).catch(() => undefined),
    );
    return c.json(ok(serializeProject(row)), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{projectId}/rollback",
    tags: [TAG_VERSION],
    summary:
      "Roll back to a prior version by appending its schema as a new version (label='rollback to vN').",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: { "application/json": { schema: RollbackVersionSchema } },
      },
    },
    responses: {
      201: {
        description: "Rolled back",
        content: {
          "application/json": {
            schema: envelopeOf(
              PageVersionResponseSchema.extend({
                project: PageProjectResponseSchema.nullable(),
              }),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const { version, project } = await pageService.rollback(
      orgId,
      projectId,
      input,
      c.var.user?.id ?? null,
    );
    // Only bust the runtime cache if the rollback actually re-published
    // (publishImmediately=true). Otherwise the published pointer is
    // unchanged and the cached payload is still correct.
    if (project) {
      c.executionCtx.waitUntil(
        invalidateRuntimeCache(project.slug).catch(() => undefined),
      );
    }
    return c.json(
      ok({
        ...serializeVersion(version),
        project: project ? serializeProject(project) : null,
      }),
      201,
    );
  },
);

// ─── Conversations ─────────────────────────────────────────────────

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{projectId}/conversations",
    tags: [TAG_CONVERSATION],
    summary: "Replay AI chat history for a page project",
    request: {
      params: ProjectIdParamSchema,
      query: ListConversationsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageConversationListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const { limit, afterMessageId } = c.req.valid("query");
    const items = await pageService.listConversation(orgId, projectId, {
      limit,
      afterMessageId,
    });
    return c.json(ok({ items: items.map(serializeConversation) }), 200);
  },
);

pageRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{projectId}/conversations",
    tags: [TAG_CONVERSATION],
    summary:
      "Append a conversation message (idempotent on (projectId, messageId)).",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: {
          "application/json": { schema: AppendConversationMessageSchema },
        },
      },
    },
    responses: {
      201: {
        description: "Appended",
        content: {
          "application/json": {
            schema: envelopeOf(PageConversationResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await pageService.appendConversationMessage(
      orgId,
      projectId,
      input,
    );
    return c.json(ok(serializeConversation(row)), 201);
  },
);

// ─── Form submissions (admin list) ────────────────────────────────

pageRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{projectId}/submissions",
    tags: [TAG_SUBMISSION],
    summary:
      "List end-user form submissions for the project (admin debugging).",
    request: {
      params: ProjectIdParamSchema,
      query: ListFormSubmissionsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(PageFormSubmissionListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { projectId } = c.req.valid("param");
    const filter = c.req.valid("query");
    const page = await pageService.listFormSubmissions(
      orgId,
      projectId,
      filter,
    );
    return c.json(
      ok({
        items: page.items.map(serializeSubmission),
        nextCursor: page.nextCursor,
      }),
      200,
    );
  },
);
