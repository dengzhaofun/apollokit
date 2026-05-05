/**
 * Page module service — protocol-agnostic business logic for AI-built
 * landing-page projects.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or `../../db`. It
 * receives its dependencies through `Pick<AppDeps, ...>`. See
 * apps/server/CLAUDE.md for the rule.
 *
 * ---------------------------------------------------------------------
 * Resource model
 * ---------------------------------------------------------------------
 *
 * - `pageProjects`              — one row per project; slug is global, status
 *                                 tracks lifecycle, `publishedVersionId` is a
 *                                 soft pointer into the versions table.
 * - `pageProjectVersions`       — append-only schema snapshots. Drafts and
 *                                 publishes both write a new row; rollback
 *                                 copies an old row's schema into a new row
 *                                 (label = "rollback to vN") so the
 *                                 timeline is always strictly monotonic.
 * - `pageProjectConversations`  — append-only AI chat log; `messageId` is
 *                                 the ai-sdk message id (de-dup key).
 * - `pageTemplates`             — global, official starter templates.
 * - `pageFormSubmissions`       — end-user form payloads from
 *                                 `activity-form` blocks.
 *
 * ---------------------------------------------------------------------
 * Schema validation
 * ---------------------------------------------------------------------
 *
 * `proposeDraft` runs `validatePageProjectSchema` on every incoming
 * snapshot. Outer-shape validation (zod) happens at the route boundary
 * via `PageProjectSchemaSchema` in validators.ts. The service-level
 * checks here are about cross-references the route can't see:
 *
 *   - every `BlockNode.binding.module` must be in `project.boundModules`
 *   - `defaultPageId` must reference a real `PageNode.id`
 *   - `PageNode.id` and `BlockNode.id` must be unique within the project
 *   - navigation items must reference real pages
 *
 * Block-level prop schemas (each block has its own zod schema in
 * `@repo/page-blocks`) are validated by the AI agent's `proposePageDraft`
 * tool BEFORE calling this service — the service trusts what it gets.
 * Adding cross-package imports here would create an apps→packages cycle
 * we don't want.
 */

import { and, desc, eq, gt, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  pageFormSubmissions,
  pageProjectConversations,
  pageProjectVersions,
  pageProjects,
  pageTemplates,
} from "../../schema/page";
import {
  PageBoundModuleViolation,
  PageInvalidSchema,
  PageProjectNotFound,
  PageProjectSlugConflict,
  PageProjectSlugReserved,
  PageTemplateNotFound,
  PageVersionNotFound,
} from "./errors";
import { signPreviewToken } from "./preview-token";
import { isReservedSlug } from "./reserved-slugs";
import type {
  PageAuthMode,
  PageConversationRole,
  PageFormSubmission,
  PageProject,
  PageProjectConversation,
  PageProjectSchema,
  PageProjectStatus,
  PageProjectVersion,
  PageTemplate,
  PageTemplateCategory,
  PageVersionAuthorType,
} from "./types";
import type {
  AppendConversationMessageInput,
  CreatePageProjectInput,
  ProposePageDraftInput,
  RollbackVersionInput,
  UpdatePageProjectInput,
} from "./validators";

// `events` is optional so future tests that pass only { db } keep
// compiling. Production wiring (barrel index.ts) always supplies it.
type PageDeps = Pick<AppDeps, "db" | "appSecret"> &
  Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with page-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "page.project.created": {
      tenantId: string;
      projectId: string;
      slug: string;
      authMode: PageAuthMode;
    };
    "page.project.updated": {
      tenantId: string;
      projectId: string;
      slug: string;
    };
    "page.project.deleted": {
      tenantId: string;
      projectId: string;
      slug: string;
    };
    "page.version.created": {
      tenantId: string;
      projectId: string;
      versionId: string;
      versionNumber: number;
      authorType: PageVersionAuthorType;
    };
    "page.version.published": {
      tenantId: string;
      projectId: string;
      slug: string;
      versionId: string;
      versionNumber: number;
    };
    "page.form.submitted": {
      tenantId: string;
      projectId: string;
      pageId: string;
      blockId: string;
      submissionId: string;
    };
  }
}

// ─── Cross-reference validator ────────────────────────────────────

/**
 * Run service-level cross-reference checks on a PageProjectSchema.
 * Throws `PageInvalidSchema` / `PageBoundModuleViolation` on failure.
 *
 * The route's zod validator already guarantees the outer shape; this
 * function only checks things zod can't (id uniqueness, references
 * pointing at real pages, modules within the project's allowance).
 */
function validatePageProjectSchema(
  schema: PageProjectSchema,
  boundModules: ReadonlySet<string>,
): void {
  const seenPageIds = new Set<string>();
  const seenBlockIds = new Set<string>();
  const missingModules = new Set<string>();

  for (const page of schema.pages) {
    if (seenPageIds.has(page.id)) {
      throw new PageInvalidSchema(`duplicate page id: ${page.id}`);
    }
    seenPageIds.add(page.id);

    for (const block of page.blocks) {
      const blockKey = `${page.id}.${block.id}`;
      if (seenBlockIds.has(blockKey)) {
        throw new PageInvalidSchema(
          `duplicate block id within page ${page.id}: ${block.id}`,
        );
      }
      seenBlockIds.add(blockKey);

      if (block.binding && !boundModules.has(block.binding.module)) {
        missingModules.add(block.binding.module);
      }
    }
  }

  if (!seenPageIds.has(schema.defaultPageId)) {
    throw new PageInvalidSchema(
      `defaultPageId references unknown page: ${schema.defaultPageId}`,
    );
  }

  if (schema.navigation) {
    for (const item of schema.navigation.items) {
      if (!seenPageIds.has(item.pageId)) {
        throw new PageInvalidSchema(
          `navigation item references unknown page: ${item.pageId}`,
        );
      }
    }
  }

  if (missingModules.size > 0) {
    throw new PageBoundModuleViolation(Array.from(missingModules).sort());
  }
}

// ─── Service factory ──────────────────────────────────────────────

export function createPageService(d: PageDeps) {
  const { db, events, appSecret } = d;

  // ─── Project loaders (tenant-scoped) ───────────────────────────

  async function loadProjectById(
    tenantId: string,
    projectId: string,
  ): Promise<PageProject> {
    const rows = await db
      .select()
      .from(pageProjects)
      .where(
        and(
          eq(pageProjects.tenantId, tenantId),
          eq(pageProjects.id, projectId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new PageProjectNotFound(projectId);
    return rows[0];
  }

  async function loadVersion(
    projectId: string,
    versionId: string,
  ): Promise<PageProjectVersion> {
    const rows = await db
      .select()
      .from(pageProjectVersions)
      .where(
        and(
          eq(pageProjectVersions.projectId, projectId),
          eq(pageProjectVersions.id, versionId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new PageVersionNotFound(versionId);
    return rows[0];
  }

  async function nextVersionNumber(projectId: string): Promise<number> {
    const rows = await db
      .select({
        max: sql<number>`COALESCE(MAX(${pageProjectVersions.versionNumber}), 0)`,
      })
      .from(pageProjectVersions)
      .where(eq(pageProjectVersions.projectId, projectId));
    return Number(rows[0]?.max ?? 0) + 1;
  }

  return {
    // ─── Projects ─────────────────────────────────────────────────

    async listProjects(
      tenantId: string,
      filter: {
        status?: PageProjectStatus;
      } & PageParams = {},
    ): Promise<Page<PageProject>> {
      const limit = clampLimit(filter.limit);
      const where = and(
        eq(pageProjects.tenantId, tenantId),
        filter.status ? eq(pageProjects.status, filter.status) : undefined,
        cursorWhere(filter.cursor, pageProjects.createdAt, pageProjects.id),
      );
      const rows = await db
        .select()
        .from(pageProjects)
        .where(where)
        .orderBy(desc(pageProjects.createdAt), desc(pageProjects.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getProjectById(
      tenantId: string,
      projectId: string,
    ): Promise<PageProject> {
      return loadProjectById(tenantId, projectId);
    },

    async getProjectBySlug(slug: string): Promise<PageProject | null> {
      const rows = await db
        .select()
        .from(pageProjects)
        .where(eq(pageProjects.slug, slug))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * Create a new project. If `templateId` is supplied, copy the
     * template's schema into a v1 draft as the project's first version.
     * Otherwise the project is created with no versions yet —
     * `proposeDraft` writes v1 on the first AI/human edit.
     *
     * `clientCredentialId` is set later by the client-credentials module
     * (separate PR); for now we leave it null and the routes layer can
     * patch it via `updateProject`.
     */
    async createProject(
      tenantId: string,
      input: CreatePageProjectInput,
      createdBy: string | null,
    ): Promise<{
      project: PageProject;
      initialVersion: PageProjectVersion | null;
    }> {
      if (isReservedSlug(input.slug)) {
        throw new PageProjectSlugReserved(input.slug);
      }

      let template: PageTemplate | null = null;
      if (input.templateId) {
        const rows = await db
          .select()
          .from(pageTemplates)
          .where(eq(pageTemplates.id, input.templateId))
          .limit(1);
        if (!rows[0]) throw new PageTemplateNotFound(input.templateId);
        template = rows[0];
      }

      const boundModules = input.boundModules ?? [];

      // If a template is requested, ensure the project's bound modules
      // cover the template's required modules — otherwise the rendered
      // page would have unbound blocks.
      if (template) {
        const projectModules = new Set(boundModules);
        const missing = template.requiredModules.filter(
          (m) => !projectModules.has(m),
        );
        if (missing.length > 0) {
          throw new PageBoundModuleViolation(missing);
        }
      }

      let project: PageProject;
      try {
        const [row] = await db
          .insert(pageProjects)
          .values({
            tenantId,
            slug: input.slug,
            name: input.name,
            authMode: input.authMode,
            boundModules,
            settings: input.settings ?? {},
            createdBy,
          })
          .returning();
        if (!row) throw new Error("page project insert returned no row");
        project = row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PageProjectSlugConflict(input.slug);
        }
        throw err;
      }

      let initialVersion: PageProjectVersion | null = null;
      if (template) {
        const [row] = await db
          .insert(pageProjectVersions)
          .values({
            projectId: project.id,
            versionNumber: 1,
            label: `from template: ${template.slug}`,
            schema: template.schema,
            authorType: "human",
            authorId: createdBy,
            parentVersionId: null,
          })
          .returning();
        if (row) initialVersion = row;
      }

      if (events) {
        await events.emit("page.project.created", {
          tenantId,
          projectId: project.id,
          slug: project.slug,
          authMode: project.authMode as PageAuthMode,
        });
      }
      return { project, initialVersion };
    },

    async updateProject(
      tenantId: string,
      projectId: string,
      input: UpdatePageProjectInput,
    ): Promise<PageProject> {
      // Ownership check — throws if project belongs to a different tenant.
      await loadProjectById(tenantId, projectId);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.status !== undefined) patch.status = input.status;
      if (input.boundModules !== undefined)
        patch.boundModules = input.boundModules;
      if (input.settings !== undefined) patch.settings = input.settings;

      if (Object.keys(patch).length === 0) {
        return loadProjectById(tenantId, projectId);
      }

      const [row] = await db
        .update(pageProjects)
        .set(patch)
        .where(
          and(
            eq(pageProjects.tenantId, tenantId),
            eq(pageProjects.id, projectId),
          ),
        )
        .returning();
      if (!row) throw new PageProjectNotFound(projectId);

      if (events) {
        await events.emit("page.project.updated", {
          tenantId,
          projectId: row.id,
          slug: row.slug,
        });
      }
      return row;
    },

    async deleteProject(tenantId: string, projectId: string): Promise<void> {
      const deleted = await db
        .delete(pageProjects)
        .where(
          and(
            eq(pageProjects.tenantId, tenantId),
            eq(pageProjects.id, projectId),
          ),
        )
        .returning({ id: pageProjects.id, slug: pageProjects.slug });
      const row = deleted[0];
      if (!row) throw new PageProjectNotFound(projectId);

      if (events) {
        await events.emit("page.project.deleted", {
          tenantId,
          projectId: row.id,
          slug: row.slug,
        });
      }
    },

    // ─── Versions ─────────────────────────────────────────────────

    async listVersions(
      tenantId: string,
      projectId: string,
      filter: PageParams = {},
    ): Promise<Page<PageProjectVersion>> {
      // Ownership check.
      await loadProjectById(tenantId, projectId);

      const limit = clampLimit(filter.limit);
      const where = and(
        eq(pageProjectVersions.projectId, projectId),
        cursorWhere(
          filter.cursor,
          pageProjectVersions.createdAt,
          pageProjectVersions.id,
        ),
      );
      const rows = await db
        .select()
        .from(pageProjectVersions)
        .where(where)
        .orderBy(
          desc(pageProjectVersions.createdAt),
          desc(pageProjectVersions.id),
        )
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getVersion(
      tenantId: string,
      projectId: string,
      versionId: string,
    ): Promise<PageProjectVersion> {
      await loadProjectById(tenantId, projectId);
      return loadVersion(projectId, versionId);
    },

    /**
     * Append a new version. Used by the AI agent's `proposePageDraft`
     * tool and by manual human edits. Always creates a NEW row — never
     * mutates an existing version.
     */
    async proposeDraft(
      tenantId: string,
      projectId: string,
      input: ProposePageDraftInput,
      authorId: string | null,
    ): Promise<PageProjectVersion> {
      const project = await loadProjectById(tenantId, projectId);

      validatePageProjectSchema(
        input.schema as unknown as PageProjectSchema,
        new Set(project.boundModules),
      );

      // If parentVersionId is supplied, sanity-check it belongs to this
      // project. If not, fall back to the published pointer.
      const parentVersionId =
        input.parentVersionId ?? project.publishedVersionId ?? null;
      if (input.parentVersionId) {
        await loadVersion(projectId, input.parentVersionId);
      }

      const versionNumber = await nextVersionNumber(projectId);

      try {
        const [row] = await db
          .insert(pageProjectVersions)
          .values({
            projectId,
            versionNumber,
            label: input.label ?? null,
            schema: input.schema as unknown as Record<string, unknown>,
            parentVersionId,
            authorType: input.authorType ?? "human",
            authorId,
            conversationMessageId: input.conversationMessageId ?? null,
          })
          .returning();
        if (!row) throw new Error("page version insert returned no row");

        if (events) {
          await events.emit("page.version.created", {
            tenantId,
            projectId,
            versionId: row.id,
            versionNumber: row.versionNumber,
            authorType: row.authorType as PageVersionAuthorType,
          });
        }
        return row;
      } catch (err) {
        // Concurrent propose on the same project — extremely unlikely
        // under normal AI conversational flow (one user, one chat) but
        // possible. Rebuild the version number once and retry.
        if (isUniqueViolation(err)) {
          const retryNumber = await nextVersionNumber(projectId);
          const [row] = await db
            .insert(pageProjectVersions)
            .values({
              projectId,
              versionNumber: retryNumber,
              label: input.label ?? null,
              schema: input.schema as unknown as Record<string, unknown>,
              parentVersionId,
              authorType: input.authorType ?? "human",
              authorId,
              conversationMessageId: input.conversationMessageId ?? null,
            })
            .returning();
          if (!row) throw new Error("page version retry insert returned no row");
          if (events) {
            await events.emit("page.version.created", {
              tenantId,
              projectId,
              versionId: row.id,
              versionNumber: row.versionNumber,
              authorType: row.authorType as PageVersionAuthorType,
            });
          }
          return row;
        }
        throw err;
      }
    },

    /**
     * Mark a specific version as the live published one. Updates the
     * project's `publishedVersionId` pointer + sets status to 'published'.
     * The pages worker reads `publishedVersionId` on every public request,
     * so this is the only step needed to make a version go live (modulo
     * the KV cache invalidation, which the routes layer handles).
     */
    async publishVersion(
      tenantId: string,
      projectId: string,
      versionId: string,
    ): Promise<PageProject> {
      const project = await loadProjectById(tenantId, projectId);
      const version = await loadVersion(projectId, versionId);

      const [row] = await db
        .update(pageProjects)
        .set({
          publishedVersionId: version.id,
          status: "published",
        })
        .where(eq(pageProjects.id, project.id))
        .returning();
      if (!row) throw new PageProjectNotFound(projectId);

      if (events) {
        await events.emit("page.version.published", {
          tenantId,
          projectId,
          slug: row.slug,
          versionId: version.id,
          versionNumber: version.versionNumber,
        });
      }
      return row;
    },

    /**
     * Rollback by COPY. Take version N's schema, write it as a new
     * version N+M with `label="rollback to vN"` and
     * `parentVersionId=N`. If `publishImmediately` is true, also flip
     * the project pointer.
     *
     * Rolling back never deletes existing versions — the timeline is
     * append-only so the operator can roll forward again at will.
     */
    async rollback(
      tenantId: string,
      projectId: string,
      input: RollbackVersionInput,
      authorId: string | null,
    ): Promise<{ version: PageProjectVersion; project: PageProject | null }> {
      const project = await loadProjectById(tenantId, projectId);
      const target = await loadVersion(projectId, input.versionId);

      const newVersion = await this.proposeDraft(
        tenantId,
        projectId,
        {
          schema: target.schema as unknown as PageProjectSchema,
          label: `rollback to v${target.versionNumber}`,
          authorType: "human",
          parentVersionId: target.id,
        },
        authorId,
      );

      let updatedProject: PageProject | null = null;
      if (input.publishImmediately) {
        updatedProject = await this.publishVersion(
          tenantId,
          project.id,
          newVersion.id,
        );
      }
      return { version: newVersion, project: updatedProject };
    },

    // ─── Conversation history ─────────────────────────────────────

    async listConversation(
      tenantId: string,
      projectId: string,
      opts: { limit?: number; afterMessageId?: string } = {},
    ): Promise<PageProjectConversation[]> {
      await loadProjectById(tenantId, projectId);

      const limit = Math.max(1, Math.min(500, opts.limit ?? 200));

      let cursorCreatedAt: Date | null = null;
      if (opts.afterMessageId) {
        const cursor = await db
          .select({ createdAt: pageProjectConversations.createdAt })
          .from(pageProjectConversations)
          .where(
            and(
              eq(pageProjectConversations.projectId, projectId),
              eq(pageProjectConversations.messageId, opts.afterMessageId),
            ),
          )
          .limit(1);
        cursorCreatedAt = cursor[0]?.createdAt ?? null;
      }

      const rows = await db
        .select()
        .from(pageProjectConversations)
        .where(
          and(
            eq(pageProjectConversations.projectId, projectId),
            cursorCreatedAt
              ? gt(pageProjectConversations.createdAt, cursorCreatedAt)
              : undefined,
          ),
        )
        .orderBy(pageProjectConversations.createdAt)
        .limit(limit);
      return rows;
    },

    /**
     * Append a message. Idempotent on `(projectId, messageId)` — the AI
     * SDK retries can resend the same message and we won't duplicate.
     * Returns the existing row on retry so the caller can read back any
     * `proposedVersionId` association set previously.
     */
    async appendConversationMessage(
      tenantId: string,
      projectId: string,
      input: AppendConversationMessageInput,
    ): Promise<PageProjectConversation> {
      await loadProjectById(tenantId, projectId);

      try {
        const [row] = await db
          .insert(pageProjectConversations)
          .values({
            projectId,
            messageId: input.messageId,
            role: input.role,
            content: input.content,
            proposedVersionId: input.proposedVersionId ?? null,
          })
          .returning();
        if (!row) throw new Error("conversation message insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Idempotent retry — return the existing row.
          const existing = await db
            .select()
            .from(pageProjectConversations)
            .where(
              and(
                eq(pageProjectConversations.projectId, projectId),
                eq(pageProjectConversations.messageId, input.messageId),
              ),
            )
            .limit(1);
          if (existing[0]) return existing[0];
        }
        throw err;
      }
    },

    // ─── Templates (admin-readable, system-seeded) ─────────────────

    async listTemplates(filter: {
      category?: PageTemplateCategory;
      requiredModule?: string;
    } = {}): Promise<PageTemplate[]> {
      const where = and(
        filter.category ? eq(pageTemplates.category, filter.category) : undefined,
        // requiredModule check is jsonb @> [...] — Postgres-specific.
        filter.requiredModule
          ? sql`${pageTemplates.requiredModules} @> ${JSON.stringify([filter.requiredModule])}::jsonb`
          : undefined,
      );
      const rows = await db
        .select()
        .from(pageTemplates)
        .where(where)
        .orderBy(pageTemplates.sortOrder, pageTemplates.createdAt);
      return rows;
    },

    async getTemplate(templateId: string): Promise<PageTemplate> {
      const rows = await db
        .select()
        .from(pageTemplates)
        .where(eq(pageTemplates.id, templateId))
        .limit(1);
      if (!rows[0]) throw new PageTemplateNotFound(templateId);
      return rows[0];
    },

    /**
     * Upsert a template by slug. Used by the template seeder
     * (`seed-templates.ts`) and by future "save as template" flows.
     * Tenant-private templates are not supported in v1.
     */
    async upsertTemplate(input: {
      slug: string;
      name: string;
      description?: string | null;
      category: PageTemplateCategory;
      coverImageUrl?: string | null;
      schema: PageProjectSchema;
      requiredModules?: string[];
      isOfficial?: boolean;
      sortOrder?: number;
    }): Promise<PageTemplate> {
      const [row] = await db
        .insert(pageTemplates)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          category: input.category,
          coverImageUrl: input.coverImageUrl ?? null,
          schema: input.schema as unknown as Record<string, unknown>,
          requiredModules: input.requiredModules ?? [],
          isOfficial: input.isOfficial ?? true,
          sortOrder: input.sortOrder ?? 0,
        })
        .onConflictDoUpdate({
          target: pageTemplates.slug,
          set: {
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            coverImageUrl: input.coverImageUrl ?? null,
            schema: input.schema as unknown as Record<string, unknown>,
            requiredModules: input.requiredModules ?? [],
            isOfficial: input.isOfficial ?? true,
            sortOrder: input.sortOrder ?? 0,
          },
        })
        .returning();
      if (!row) throw new Error("page template upsert returned no row");
      return row;
    },

    // ─── Form submissions ─────────────────────────────────────────

    /**
     * Append an end-user form submission. Called by the page client
     * route (`POST /api/v1/client/page/forms`) when a player submits
     * an `activity-form` block.
     */
    async appendFormSubmission(
      tenantId: string,
      projectId: string,
      input: {
        pageId: string;
        blockId: string;
        endUserId: string | null;
        payload: Record<string, unknown>;
      },
    ): Promise<PageFormSubmission> {
      await loadProjectById(tenantId, projectId);

      const [row] = await db
        .insert(pageFormSubmissions)
        .values({
          projectId,
          pageId: input.pageId,
          blockId: input.blockId,
          endUserId: input.endUserId,
          payload: input.payload,
        })
        .returning();
      if (!row) throw new Error("form submission insert returned no row");

      if (events) {
        await events.emit("page.form.submitted", {
          tenantId,
          projectId,
          pageId: row.pageId,
          blockId: row.blockId,
          submissionId: row.id,
        });
      }
      return row;
    },

    /**
     * Admin-side: paginated list of form submissions for a project.
     * Used by `/pages/$projectId/submissions` in admin UI (PR 8) and
     * for runtime debugging today. Filterable by pageId / blockId.
     */
    async listFormSubmissions(
      tenantId: string,
      projectId: string,
      filter: {
        pageId?: string;
        blockId?: string;
      } & PageParams = {},
    ): Promise<Page<PageFormSubmission>> {
      await loadProjectById(tenantId, projectId);
      const limit = clampLimit(filter.limit);
      const where = and(
        eq(pageFormSubmissions.projectId, projectId),
        filter.pageId ? eq(pageFormSubmissions.pageId, filter.pageId) : undefined,
        filter.blockId
          ? eq(pageFormSubmissions.blockId, filter.blockId)
          : undefined,
        cursorWhere(
          filter.cursor,
          pageFormSubmissions.createdAt,
          pageFormSubmissions.id,
        ),
      );
      const rows = await db
        .select()
        .from(pageFormSubmissions)
        .where(where)
        .orderBy(
          desc(pageFormSubmissions.createdAt),
          desc(pageFormSubmissions.id),
        )
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Preview token ────────────────────────────────────────────

    /**
     * Sign a short-lived JWT that authorizes the admin iframe to render
     * a specific draft version on the pages worker. The token is
     * tenant-scoped indirectly: the caller already passed tenantId
     * through the project ownership check before getting here.
     *
     * MVP signs with `appSecret` (== BETTER_AUTH_SECRET) — when the
     * pages worker lands (PR 3) we will rotate to a dedicated
     * PAGES_PREVIEW_SECRET env var and update both this side and the
     * pages-worker verifier together.
     */
    async createPreviewToken(
      tenantId: string,
      projectId: string,
      versionId: string,
      ttlSeconds = 300,
    ): Promise<{ token: string; expiresAt: Date }> {
      await loadProjectById(tenantId, projectId);
      await loadVersion(projectId, versionId);

      const token = await signPreviewToken(
        appSecret,
        projectId,
        versionId,
        ttlSeconds,
      );
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      return { token, expiresAt };
    },
  };
}

export type PageService = ReturnType<typeof createPageService>;
export { validatePageProjectSchema };
// Re-export role/category for tests / cross-module imports.
export type {
  PageConversationRole,
  PageProject,
  PageProjectVersion,
  PageProjectConversation,
  PageTemplate,
  PageFormSubmission,
};
