/**
 * Domain types for the page module.
 *
 * The `PageProjectSchema` interface is the *authoritative* shape of an
 * AI-generated page project. Every page_project_versions.schema row stores
 * one of these. The runtime renderer in `apps/pages/` and the
 * `@repo/page-blocks` package both treat this type as their contract.
 *
 * `BlockNode.props` is intentionally typed as `Record<string, unknown>`:
 * each block type has its own zod schema (registered in the page-blocks
 * catalog) which the service-layer `validatePageProjectSchema` runs at
 * `proposePageDraft` time. Tightening the type here would force the service
 * to import from page-blocks, creating an apps→packages cycle we don't want.
 */

import type {
  pageFormSubmissions,
  pageProjectConversations,
  pageProjects,
  pageProjectVersions,
  pageTemplates,
} from "../../schema/page";

// ─── DB row aliases ───────────────────────────────────────────────

export type PageProject = typeof pageProjects.$inferSelect;
export type PageProjectVersion = typeof pageProjectVersions.$inferSelect;
export type PageProjectConversation =
  typeof pageProjectConversations.$inferSelect;
export type PageTemplate = typeof pageTemplates.$inferSelect;
export type PageFormSubmission = typeof pageFormSubmissions.$inferSelect;

// ─── Enum tuples (Zod-enforced at the validator layer) ────────────

export const PAGE_AUTH_MODES = [
  "anonymous",
  "platform_auth",
  "hmac_external",
] as const;
export type PageAuthMode = (typeof PAGE_AUTH_MODES)[number];

export const PAGE_PROJECT_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type PageProjectStatus = (typeof PAGE_PROJECT_STATUSES)[number];

export const PAGE_VERSION_AUTHOR_TYPES = ["ai", "human"] as const;
export type PageVersionAuthorType = (typeof PAGE_VERSION_AUTHOR_TYPES)[number];

export const PAGE_CONVERSATION_ROLES = ["user", "assistant", "tool"] as const;
export type PageConversationRole = (typeof PAGE_CONVERSATION_ROLES)[number];

export const PAGE_TEMPLATE_CATEGORIES = [
  "checkin",
  "shop",
  "lottery",
  "redeem",
  "leaderboard",
  "event",
  "marketing",
  "other",
] as const;
export type PageTemplateCategory = (typeof PAGE_TEMPLATE_CATEGORIES)[number];

// ─── PageProjectSchema (the JSON snapshot stored in versions.schema) ──

/**
 * Theme tokens applied at the project root. The renderer maps these onto
 * CSS custom properties at SSR time so block components can reference
 * `var(--page-primary)` etc. without each block re-reading theme.
 */
export interface ThemeTokens {
  primary: string;
  bg: string;
  fg: string;
  fontHeading?: string;
  fontBody?: string;
  radius?: "none" | "sm" | "md" | "lg" | "xl";
  mode?: "light" | "dark" | "auto";
}

/**
 * Declarative binding from a block to a server-side game module. The
 * `proposePageDraft` validator checks `module ∈ project.boundModules`;
 * the block's SSR loader uses `method` + `params` to call the right
 * `/api/v1/client/<module>/...` endpoint.
 */
export interface BlockBinding {
  module: string;
  method?: string;
  params?: Record<string, unknown>;
}

/**
 * One rendered block. `type` is the block's catalog key — the renderer
 * looks it up in the page-blocks registry to find the React component
 * and the zod schema for `props`.
 */
export interface BlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  binding?: BlockBinding;
  // Block-level auth gate. `requireUser` wraps the block in an AuthGate
  // that defers render until the player is identified (cookie / hmac /
  // platform_auth depending on project authMode).
  authGate?: "public" | "requireUser";
}

/**
 * A single page within the project. `path` is matched by the pages
 * worker's catch-all route — `/`, `/checkin`, `/shop` etc.
 */
export interface PageNode {
  id: string;
  path: string;
  title: string;
  seo?: {
    description?: string;
    ogImage?: string;
  };
  blocks: BlockNode[];
}

/**
 * The full snapshot of a project at a single version. Stored in
 * `page_project_versions.schema` as JSONB. Every AI propose / human
 * edit / rollback writes a NEW row — the schema is never mutated in
 * place. Pages worker reads `project.publishedVersionId` then renders
 * the schema referenced there.
 */
export interface PageProjectSchema {
  // Schema version for forward-compat. Bump and add a migrator when the
  // shape changes; existing rows with version=1 keep working.
  version: 1;
  theme: ThemeTokens;
  pages: PageNode[];
  navigation?: {
    items: Array<{ label: string; pageId: string }>;
  };
  // Which page renders at the subdomain root (`/`).
  defaultPageId: string;
  seo?: {
    siteName?: string;
    defaultOgImage?: string;
  };
}

// ─── Preview JWT payload ──────────────────────────────────────────

/**
 * Payload for the short-lived (5 min) preview JWT signed by admin and
 * verified by the pages worker on `/__preview/<projectId>`. Keeps draft
 * versions out of the public KV cache and protects unpublished pages
 * from scraping.
 */
export interface PreviewTokenPayload {
  projectId: string;
  versionId: string;
  // Standard JWT claims.
  iat: number;
  exp: number;
  // hono/jwt's JWTPayload requires an index signature; keeps future
  // optional claims (e.g. tenantId) addable without a type change.
  [key: string]: unknown;
}
