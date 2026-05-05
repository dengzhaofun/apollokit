/**
 * PageProjectSchema — the JSON snapshot AI/operators emit and the pages
 * worker renders.
 *
 * This file is the **source of truth** for the schema shape on the
 * client-side rendering path. The server module
 * `apps/server/src/modules/page/types.ts` keeps a structural mirror; if
 * either side changes, the other must follow. We don't import the
 * server module here to avoid an apps→packages reverse dependency
 * (packages must stay free of `apps/*` imports per Turborepo conventions).
 *
 * Each `BlockNode.props` is validated by the per-component zod schema
 * registered in `catalog.ts`. The outer shape is validated by
 * `pageProjectSchemaSchema` below — we provide both the TS interface
 * (for editor authoring + type-safe SSR loaders) and the zod schema
 * (for runtime validation in the agent's `proposePageDraft` tool and
 * in tests).
 */

import { z } from "zod";

// ─── Outer shape: theme / pages / navigation ───────────────────────

export const themeTokensSchema = z.object({
  primary: z.string(),
  bg: z.string(),
  fg: z.string(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  radius: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
  mode: z.enum(["light", "dark", "auto"]).optional(),
});

export const blockBindingSchema = z.object({
  module: z.string().min(1),
  method: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
});

/**
 * One rendered block. `type` is the catalog key (must exist in
 * `catalog.ts`); `props` is the data for that catalog component
 * (validated by the catalog's per-component zod schema).
 */
export const blockNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.string(), z.any()),
  binding: blockBindingSchema.optional(),
  authGate: z.enum(["public", "requireUser"]).optional(),
});

export const pageNodeSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  seo: z
    .object({
      description: z.string().optional(),
      ogImage: z.string().url().optional(),
    })
    .optional(),
  blocks: z.array(blockNodeSchema),
});

export const pageProjectSchemaSchema = z.object({
  version: z.literal(1),
  theme: themeTokensSchema,
  pages: z.array(pageNodeSchema).min(1),
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
});

// ─── Inferred TS types ────────────────────────────────────────────

export type ThemeTokens = z.infer<typeof themeTokensSchema>;
export type BlockBinding = z.infer<typeof blockBindingSchema>;
export type BlockNode = z.infer<typeof blockNodeSchema>;
export type PageNode = z.infer<typeof pageNodeSchema>;
export type PageProjectSchema = z.infer<typeof pageProjectSchemaSchema>;

// ─── Cross-reference validator (mirrors server-side service check) ──

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

/**
 * Run the same cross-reference validation the server-side
 * `proposeDraft` does:
 *   - duplicate page id / block id (within a page)
 *   - defaultPageId references an existing page
 *   - navigation items reference existing pages
 *   - block.binding.module ∈ allowedModules (when allowedModules is
 *     supplied; pass undefined to skip the binding check, e.g. when
 *     rendering a project whose boundModules list isn't to hand)
 *   - block.type ∈ allowedTypes (when allowedTypes is supplied; the
 *     catalog's complete keys list works as the universe)
 *
 * Returns a list of issues — empty list means schema is valid. The
 * caller decides whether to throw or accumulate.
 */
export function validatePageProjectSchema(
  schema: PageProjectSchema,
  options: {
    allowedModules?: ReadonlySet<string>;
    allowedTypes?: ReadonlySet<string>;
  } = {},
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const seenPageIds = new Set<string>();

  for (const [pageIdx, page] of schema.pages.entries()) {
    if (seenPageIds.has(page.id)) {
      issues.push({
        path: `pages[${pageIdx}].id`,
        message: `duplicate page id: ${page.id}`,
      });
    }
    seenPageIds.add(page.id);

    const seenBlockIds = new Set<string>();
    for (const [blockIdx, block] of page.blocks.entries()) {
      if (seenBlockIds.has(block.id)) {
        issues.push({
          path: `pages[${pageIdx}].blocks[${blockIdx}].id`,
          message: `duplicate block id within page ${page.id}: ${block.id}`,
        });
      }
      seenBlockIds.add(block.id);

      if (options.allowedTypes && !options.allowedTypes.has(block.type)) {
        issues.push({
          path: `pages[${pageIdx}].blocks[${blockIdx}].type`,
          message: `unknown block type: ${block.type}`,
        });
      }

      if (
        options.allowedModules &&
        block.binding &&
        !options.allowedModules.has(block.binding.module)
      ) {
        issues.push({
          path: `pages[${pageIdx}].blocks[${blockIdx}].binding.module`,
          message: `block binding references module not in project boundModules: ${block.binding.module}`,
        });
      }
    }
  }

  if (!seenPageIds.has(schema.defaultPageId)) {
    issues.push({
      path: "defaultPageId",
      message: `defaultPageId references unknown page: ${schema.defaultPageId}`,
    });
  }

  if (schema.navigation) {
    for (const [navIdx, item] of schema.navigation.items.entries()) {
      if (!seenPageIds.has(item.pageId)) {
        issues.push({
          path: `navigation.items[${navIdx}].pageId`,
          message: `navigation item references unknown page: ${item.pageId}`,
        });
      }
    }
  }

  return issues;
}
