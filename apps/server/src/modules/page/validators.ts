import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { SLUG_REGEX } from "./reserved-slugs";
import {
  PAGE_AUTH_MODES,
  PAGE_CONVERSATION_ROLES,
  PAGE_PROJECT_STATUSES,
  PAGE_TEMPLATE_CATEGORIES,
  PAGE_VERSION_AUTHOR_TYPES,
} from "./types";

// ─── Reusable atoms ────────────────────────────────────────────────

const SlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(SLUG_REGEX, {
    message:
      "slug must be 3-63 chars, lowercase alphanumeric, hyphens allowed but not leading/trailing/double",
  })
  .openapi({
    description:
      "DNS-safe project slug. Becomes `<slug>.pages.apollokit.dev`. Must not be a reserved word.",
    example: "spring-checkin",
  });

const AuthModeSchema = z.enum(PAGE_AUTH_MODES).openapi({
  description:
    "How the page identifies the player. anonymous = device cookie + anonymous_cpk; platform_auth = end-user Better Auth login; hmac_external = pre-signed user hash from the integrator's backend.",
});

const ProjectStatusSchema = z.enum(PAGE_PROJECT_STATUSES);

/**
 * Project-side `boundModules` array. Service validates against the catalog
 * of registered page-blocks at runtime; we keep this open here so adding
 * new modules in page-blocks doesn't require a server validator change.
 */
const BoundModulesSchema = z
  .array(z.string().min(1).max(64))
  .max(28)
  .openapi({
    description:
      "Game module names this project may bind blocks against (e.g. ['check-in', 'shop']). Must be a subset of modules registered in @repo/page-blocks.",
  });

// ─── Page schema (the JSON snapshot) ──────────────────────────────

/**
 * The PageProjectSchema validator is intentionally lax at the route
 * boundary — we accept the full JSON and let the service-layer
 * `validatePageProjectSchema` enforce per-block zod schemas (which
 * live in @repo/page-blocks). The route only checks the outer shape.
 */
const ThemeTokensSchema = z.object({
  primary: z.string(),
  bg: z.string(),
  fg: z.string(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  radius: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
  mode: z.enum(["light", "dark", "auto"]).optional(),
});

const BlockNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
  binding: z
    .object({
      module: z.string().min(1),
      method: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  authGate: z.enum(["public", "requireUser"]).optional(),
});

const PageNodeSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  seo: z
    .object({
      description: z.string().optional(),
      ogImage: z.string().url().optional(),
    })
    .optional(),
  blocks: z.array(BlockNodeSchema),
});

export const PageProjectSchemaSchema = z
  .object({
    version: z.literal(1),
    theme: ThemeTokensSchema,
    pages: z.array(PageNodeSchema).min(1),
    navigation: z
      .object({
        items: z.array(
          z.object({ label: z.string().min(1), pageId: z.string().min(1) }),
        ),
      })
      .optional(),
    defaultPageId: z.string().min(1),
    seo: z
      .object({
        siteName: z.string().optional(),
        defaultOgImage: z.string().url().optional(),
      })
      .optional(),
  })
  .openapi("PageProjectSchema");

// ─── Project create / update ──────────────────────────────────────

export const CreatePageProjectSchema = z
  .object({
    slug: SlugSchema,
    name: z.string().min(1).max(200),
    authMode: AuthModeSchema,
    boundModules: BoundModulesSchema.optional().default([]),
    settings: z.record(z.string(), z.unknown()).optional(),
    // If supplied, service copies the template's schema into a v1 draft.
    templateId: z.string().uuid().optional(),
  })
  .openapi("PageProjectCreateRequest");

export const UpdatePageProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: ProjectStatusSchema.optional(),
    boundModules: BoundModulesSchema.optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("PageProjectUpdateRequest");

export type CreatePageProjectInput = z.input<typeof CreatePageProjectSchema>;
export type UpdatePageProjectInput = z.input<typeof UpdatePageProjectSchema>;

// ─── Version operations ────────────────────────────────────────────

export const ProposePageDraftSchema = z
  .object({
    schema: PageProjectSchemaSchema,
    label: z.string().max(200).optional(),
    authorType: z.enum(PAGE_VERSION_AUTHOR_TYPES).optional().default("human"),
    parentVersionId: z.string().uuid().optional(),
    conversationMessageId: z.string().max(128).optional(),
  })
  .openapi("PageDraftProposeRequest");

export type ProposePageDraftInput = z.input<typeof ProposePageDraftSchema>;

export const PublishVersionSchema = z
  .object({
    versionId: z.string().uuid(),
  })
  .openapi("PagePublishRequest");

export type PublishVersionInput = z.input<typeof PublishVersionSchema>;

export const RollbackVersionSchema = z
  .object({
    versionId: z.string().uuid(),
    publishImmediately: z.boolean().optional().default(false),
  })
  .openapi("PageRollbackRequest");

export type RollbackVersionInput = z.input<typeof RollbackVersionSchema>;

// ─── Conversation append (used by agent + admin) ──────────────────

export const AppendConversationMessageSchema = z
  .object({
    messageId: z.string().min(1).max(128),
    role: z.enum(PAGE_CONVERSATION_ROLES),
    content: z.record(z.string(), z.unknown()),
    proposedVersionId: z.string().uuid().optional(),
  })
  .openapi("PageConversationAppendRequest");

export type AppendConversationMessageInput = z.input<
  typeof AppendConversationMessageSchema
>;

// ─── Path / query params ──────────────────────────────────────────

export const ProjectIdParamSchema = z.object({
  projectId: z
    .string()
    .uuid()
    .openapi({ param: { name: "projectId", in: "path" } }),
});

export const VersionIdParamSchema = z.object({
  projectId: z
    .string()
    .uuid()
    .openapi({ param: { name: "projectId", in: "path" } }),
  versionId: z
    .string()
    .uuid()
    .openapi({ param: { name: "versionId", in: "path" } }),
});

export const TemplateIdParamSchema = z.object({
  templateId: z
    .string()
    .uuid()
    .openapi({ param: { name: "templateId", in: "path" } }),
});

export const ListProjectsQuerySchema = z
  .object({
    status: ProjectStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .openapi("PageProjectListQuery");

export const ListVersionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .openapi("PageVersionListQuery");

export const ListConversationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional().default(200),
    afterMessageId: z.string().optional(),
  })
  .openapi("PageConversationListQuery");

export const ListTemplatesQuerySchema = z
  .object({
    category: z.enum(PAGE_TEMPLATE_CATEGORIES).optional(),
    requiredModule: z.string().optional(),
  })
  .openapi("PageTemplateListQuery");

// ─── Response shapes ──────────────────────────────────────────────

export const PageProjectResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    slug: z.string(),
    name: z.string(),
    status: ProjectStatusSchema,
    authMode: AuthModeSchema,
    clientCredentialId: z.string().nullable(),
    boundModules: z.array(z.string()),
    publishedVersionId: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PageProject");

export const PageProjectListResponseSchema = pageOf(
  PageProjectResponseSchema,
).openapi("PageProjectList");

export const PageVersionResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    versionNumber: z.number().int(),
    label: z.string().nullable(),
    schema: z.record(z.string(), z.unknown()),
    parentVersionId: z.string().nullable(),
    authorType: z.enum(PAGE_VERSION_AUTHOR_TYPES),
    authorId: z.string().nullable(),
    conversationMessageId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("PageVersion");

export const PageVersionListResponseSchema = pageOf(
  PageVersionResponseSchema,
).openapi("PageVersionList");

export const PageConversationResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    messageId: z.string(),
    role: z.enum(PAGE_CONVERSATION_ROLES),
    content: z.record(z.string(), z.unknown()),
    proposedVersionId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("PageConversation");

export const PageConversationListResponseSchema = z
  .object({ items: z.array(PageConversationResponseSchema) })
  .openapi("PageConversationList");

export const PageTemplateResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    category: z.enum(PAGE_TEMPLATE_CATEGORIES),
    coverImageUrl: z.string().nullable(),
    schema: z.record(z.string(), z.unknown()),
    requiredModules: z.array(z.string()),
    isOfficial: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PageTemplate");

export const PageTemplateListResponseSchema = z
  .object({ items: z.array(PageTemplateResponseSchema) })
  .openapi("PageTemplateList");

export const PreviewTokenResponseSchema = z
  .object({
    token: z.string(),
    projectId: z.string(),
    versionId: z.string(),
    expiresAt: z.string(),
  })
  .openapi("PagePreviewToken");

// ─── Form submission (client + admin list) ────────────────────────

export const SubmitFormSchema = z
  .object({
    projectId: z.string().uuid(),
    pageId: z.string().min(1).max(128),
    blockId: z.string().min(1).max(128),
    payload: z.record(z.string(), z.any()),
  })
  .openapi("PageFormSubmitRequest");

export type SubmitFormInput = z.input<typeof SubmitFormSchema>;

export const PageFormSubmissionResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    pageId: z.string(),
    blockId: z.string(),
    endUserId: z.string().nullable(),
    payload: z.record(z.string(), z.any()),
    createdAt: z.string(),
  })
  .openapi("PageFormSubmission");

export const PageFormSubmissionListResponseSchema = pageOf(
  PageFormSubmissionResponseSchema,
).openapi("PageFormSubmissionList");

export const ListFormSubmissionsQuerySchema = z
  .object({
    pageId: z.string().optional(),
    blockId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().optional(),
  })
  .openapi("PageFormSubmissionListQuery");
