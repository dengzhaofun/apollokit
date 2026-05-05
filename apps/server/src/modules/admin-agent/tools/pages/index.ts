/**
 * Tools the `pages-builder` agent uses to build / iterate / publish AI
 * landing-page projects. Every tool reads the current `pageProjectId`
 * from `experimental_context.execCtx.pageProjectId` — set by the
 * server route handler from `body.context.pageProjectId` — so the
 * model can never write to the wrong project even if it forgets to
 * pass an id.
 *
 * Surface (9 tools):
 *   - createPageProject         — bootstrap a new project (rare; usually
 *                                 done from the admin "new project" UI)
 *   - listTemplates             — browse system templates
 *   - listAvailableBlocks       — discover catalog block types + props
 *                                 zod schema (the model's "what can I
 *                                 emit?" reference)
 *   - listModuleBindingTargets  — list configured shop blocks / lottery
 *                                 configs / etc. so the model picks
 *                                 real ids in `binding.params`
 *   - listAvailableMedia        — pick from media-library; no AI image
 *                                 generation in this PR
 *   - proposePageDraft          — append a new version (the workhorse;
 *                                 cross-ref validation runs here, errors
 *                                 flow back as tool result for self-fix)
 *   - publishVersion            — flip the project's published pointer
 *   - rollbackToVersion         — rewind by COPY (timeline never edits)
 *   - updateProjectSettings     — name / status / boundModules / settings
 *
 * No bottle-neck "do everything" tool — keeping each operation atomic
 * lets the agent's stop-condition (stepCountIs(N)) bound how much it
 * can do per turn.
 */

import { tool } from "ai";
import { z } from "zod";

import { aiMetadata } from "@repo/page-blocks/ai-metadata";
import { pageProjectSchemaSchema } from "@repo/page-blocks/schema";

// `CATALOG_BLOCK_TYPES` lives in catalog.ts which transitively imports
// .tsx React components, and the server tsconfig has no JSX support.
// Derive the same set from `aiMetadata` (keys are guaranteed to match
// catalog ids by the page-blocks ai-metadata test).
const CATALOG_BLOCK_TYPES = new Set(Object.keys(aiMetadata));

import { pageService } from "../../../page";
import {
  PAGE_AUTH_MODES,
  PAGE_TEMPLATE_CATEGORIES,
} from "../../../page/types";
import type { AgentToolContext } from "../../agents/types";

/** Throw a helpful error when the agent calls a project-bound tool
 *  outside a project chat. The route handler is supposed to enforce
 *  this — this is the belt-and-braces. */
function requireProjectId(ctx: AgentToolContext): string {
  const id = ctx.execCtx.pageProjectId;
  if (!id) {
    throw new Error(
      "pages-builder tool called without pageProjectId in context",
    );
  }
  return id;
}

// ─── createPageProject ────────────────────────────────────────────

const createPageProjectInput = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$/),
  authMode: z.enum(PAGE_AUTH_MODES),
  boundModules: z.array(z.string().min(1).max(64)).max(28).optional(),
  templateId: z.string().uuid().optional(),
});

export const createPageProjectTool = tool({
  description:
    "Create a brand new page project. Rare — operators usually create from the admin UI. If `templateId` is supplied the template's schema is copied into v1.",
  inputSchema: createPageProjectInput,
  async execute(input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    const result = await pageService.createProject(
      ctx.execCtx.tenantId,
      input,
      ctx.execCtx.userId ?? null,
    );
    return {
      ok: true,
      project: {
        id: result.project.id,
        slug: result.project.slug,
        name: result.project.name,
        authMode: result.project.authMode,
        boundModules: result.project.boundModules,
      },
      initialVersionId: result.initialVersion?.id ?? null,
    };
  },
});

// ─── listTemplates ────────────────────────────────────────────────

export const listTemplatesTool = tool({
  description:
    "List system / official page templates the operator can start from. Filter by category or required module.",
  inputSchema: z.object({
    category: z.enum(PAGE_TEMPLATE_CATEGORIES).optional(),
    requiredModule: z.string().min(1).optional(),
  }),
  async execute(input) {
    const items = await pageService.listTemplates(input);
    return {
      items: items.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        requiredModules: t.requiredModules,
      })),
    };
  },
});

// ─── listAvailableBlocks ──────────────────────────────────────────

export const listAvailableBlocksTool = tool({
  description:
    "List all block types in the @repo/page-blocks catalog. Each block has a `type`, AI metadata (whenToUse / examples), and a JSON-schema-style outline of its props. The model uses this to decide which block to emit.",
  inputSchema: z.object({
    category: z.enum(["marketing", "auth", "module"]).optional(),
  }),
  async execute(input) {
    const all = Array.from(CATALOG_BLOCK_TYPES);
    const filtered = input.category
      ? all.filter((t) => aiMetadata[t]?.category === input.category)
      : all;
    return {
      items: filtered.map((type) => {
        const meta = aiMetadata[type];
        return {
          type,
          category: meta?.category ?? "module",
          whenToUse: meta?.whenToUse ?? "",
          examples: meta?.examples ?? [],
        };
      }),
    };
  },
});

// ─── listModuleBindingTargets ─────────────────────────────────────

/**
 * Returns concrete ids the model can plug into `binding.params` for
 * blocks that target a specific configured resource (shop, lottery,
 * leaderboard, …). PR 7 returns a stub `items: []` for unknown modules
 * — wiring each module to its admin list call is purely additive and
 * lands incrementally as templates need them.
 */
export const listModuleBindingTargetsTool = tool({
  description:
    "List configured resources for a given module, e.g. shop blocks / lottery pools / leaderboard ids. Use to fill `binding.params` with real ids instead of guessing. Returns an empty list when no targets are registered yet — the operator can still author the block, it just won't have data on first paint.",
  inputSchema: z.object({
    module: z.string().min(1).max(64),
  }),
  async execute(_input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    // PR 7 placeholder. Each module owner adds a small adapter here as
    // the AI workflow needs it (typically: 1 line per module pulling
    // `<module>Service.list(orgId)` and projecting id+name).
    void ctx;
    return { items: [] as Array<{ id: string; name: string }> };
  },
});

// ─── listAvailableMedia ───────────────────────────────────────────

export const listAvailableMediaTool = tool({
  description:
    "List media-library assets the operator has uploaded. Use to pick `imageUrl` / `iconUrl` props rather than guessing URLs. PR 7 returns an empty list — wiring lands when the media-library service exposes a tenant-scoped list call.",
  inputSchema: z.object({
    query: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(_input) {
    // Stub for PR 7 — media-library list integration is a follow-up.
    return { items: [] as Array<{ id: string; url: string; name: string }> };
  },
});

// ─── proposePageDraft ─────────────────────────────────────────────

const proposeDraftInput = z.object({
  /**
   * Full PageProjectSchema. The model is expected to emit the entire
   * snapshot, not a patch — proposeDraft writes an immutable new
   * version each call, so partial schemas would corrupt the project.
   */
  schema: pageProjectSchemaSchema,
  label: z.string().max(200).optional(),
  parentVersionId: z.string().uuid().optional(),
  /**
   * Human-readable summary of what changed; surfaced in the version
   * timeline so reviewers don't have to diff the JSON.
   */
  summary: z.string().max(400).optional(),
});

export const proposePageDraftTool = tool({
  description:
    "Append a new draft version of the current project. Write the FULL PageProjectSchema (not a patch). Server-side cross-ref validation runs: defaultPageId must exist, ids must be unique within a page, every binding.module must be in project.boundModules, and every block type must be in the catalog. Failures come back as `{ok:false, issues:[{path,message}]}` for you to self-correct.",
  inputSchema: proposeDraftInput,
  async execute(input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    const tenantId = ctx.execCtx.tenantId;
    const projectId = requireProjectId(ctx);
    try {
      const version = await pageService.proposeDraft(
        tenantId,
        projectId,
        {
          schema: input.schema,
          label: input.label ?? input.summary ?? undefined,
          authorType: "ai",
          parentVersionId: input.parentVersionId,
          conversationMessageId: ctx.execCtx.pageConversationMessageId,
        },
        ctx.execCtx.userId ?? null,
      );
      return {
        ok: true as const,
        versionId: version.id,
        versionNumber: version.versionNumber,
        label: version.label,
      };
    } catch (err) {
      const error = err as { code?: string; message?: string };
      return {
        ok: false as const,
        code: error.code ?? "page.invalid_schema",
        message: error.message ?? "schema validation failed",
        // The agent can read this back and re-emit a corrected schema.
        // We don't expose ZodIssue paths because the service-layer
        // throws ModuleError with consolidated message strings —
        // sufficient signal for the model to fix the cited issue.
      };
    }
  },
});

// ─── publishVersion ───────────────────────────────────────────────

export const publishVersionTool = tool({
  description:
    "Mark a specific version as published — the pages worker starts serving it on the next request (KV cache TTL ≤ 60s). Use after the operator confirms a draft is ready.",
  inputSchema: z.object({ versionId: z.string().uuid() }),
  async execute(input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    const tenantId = ctx.execCtx.tenantId;
    const projectId = requireProjectId(ctx);
    const project = await pageService.publishVersion(
      tenantId,
      projectId,
      input.versionId,
    );
    return {
      ok: true,
      publishedVersionId: project.publishedVersionId,
      slug: project.slug,
      status: project.status,
    };
  },
});

// ─── rollbackToVersion ────────────────────────────────────────────

export const rollbackToVersionTool = tool({
  description:
    "Roll back to a prior version by COPYING its schema as a new version (the timeline is append-only — no destructive edits). Set `publishImmediately: true` to flip the published pointer in the same call.",
  inputSchema: z.object({
    versionId: z.string().uuid(),
    publishImmediately: z.boolean().optional().default(false),
  }),
  async execute(input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    const tenantId = ctx.execCtx.tenantId;
    const projectId = requireProjectId(ctx);
    const result = await pageService.rollback(
      tenantId,
      projectId,
      {
        versionId: input.versionId,
        publishImmediately: input.publishImmediately,
      },
      ctx.execCtx.userId ?? null,
    );
    return {
      ok: true,
      newVersionId: result.version.id,
      newVersionNumber: result.version.versionNumber,
      published: result.project != null,
    };
  },
});

// ─── updateProjectSettings ────────────────────────────────────────

export const updateProjectSettingsTool = tool({
  description:
    "Update project-level fields (name / status / boundModules / settings) without rewriting the schema. For schema content changes, use proposePageDraft.",
  inputSchema: z.object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    boundModules: z.array(z.string().min(1).max(64)).max(28).optional(),
    settings: z.record(z.string(), z.any()).optional(),
  }),
  async execute(input, { experimental_context }) {
    const ctx = experimental_context as AgentToolContext;
    const tenantId = ctx.execCtx.tenantId;
    const projectId = requireProjectId(ctx);
    const project = await pageService.updateProject(tenantId, projectId, input);
    return {
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        boundModules: project.boundModules,
      },
    };
  },
});

// ─── Aggregator ───────────────────────────────────────────────────

export function buildPagesBuilderTools() {
  return {
    createPageProject: createPageProjectTool,
    listTemplates: listTemplatesTool,
    listAvailableBlocks: listAvailableBlocksTool,
    listModuleBindingTargets: listModuleBindingTargetsTool,
    listAvailableMedia: listAvailableMediaTool,
    proposePageDraft: proposePageDraftTool,
    publishVersion: publishVersionTool,
    rollbackToVersion: rollbackToVersionTool,
    updateProjectSettings: updateProjectSettingsTool,
  };
}

export type PagesBuilderTools = ReturnType<typeof buildPagesBuilderTools>;
