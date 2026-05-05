/**
 * Public surface of `@repo/page-blocks`.
 *
 * Two import paths beyond the root:
 *   - `@repo/page-blocks/schema` — TS types + zod schema for
 *     PageProjectSchema. Server-safe (no React deps); the agent's
 *     `proposePageDraft` tool input uses this.
 *   - `@repo/page-blocks/catalog` — json-render catalog. Server-safe.
 *     Used to feed the LLM the list of legal block types + their
 *     props zod schemas.
 *   - `@repo/page-blocks/registry` — React renderer. Client / SSR
 *     only — pulls in `react-dom`. The pages worker imports this.
 *   - `@repo/page-blocks/ai-metadata` — agent-side AI metadata.
 *     Server-safe.
 *   - `@repo/page-blocks/bindings` — game-module SSR loaders. The
 *     pages worker imports this.
 *
 * Most callers can import from the root path; tree-shake will drop the
 * registry on the server side as long as it's not referenced.
 */

export {
  blockBindingSchema,
  blockNodeSchema,
  pageNodeSchema,
  pageProjectSchemaSchema,
  themeTokensSchema,
  validatePageProjectSchema,
  type BlockBinding,
  type BlockNode,
  type PageNode,
  type PageProjectSchema,
  type SchemaValidationIssue,
  type ThemeTokens,
} from "./schema.js";

export {
  CATALOG_BLOCK_TYPES,
  blockSpecSchema,
  catalog,
  type BlockSpec,
} from "./catalog.js";

export {
  aiMetadata,
  getBlockMetadata,
  renderAIMetadataMarkdown,
  type AIBlockMetadata,
} from "./ai-metadata.js";

export {
  moduleLoaders,
  resolveLoader,
  type BlockSSRContext,
  type BlockSSRData,
  type BlockSSRLoader,
} from "./bindings.js";

// React renderer — re-exports also live at `/registry`.
export {
  BlockRenderer,
  PageRenderer,
  Renderer,
  componentRegistry,
  getPageMetadata,
  iterateBlocks,
  type PageRendererContext,
} from "./registry.js";
