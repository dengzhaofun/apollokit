/**
 * Game-module binding declarations.
 *
 * A binding tells the renderer "this block needs data from server module
 * X — call this method/path at SSR time". The pages worker's SSR loader
 * walks each `BlockNode.binding` and dispatches based on `module`.
 *
 * MVP (PR 2) blocks are all marketing or pure-auth — none of them bind a
 * game module. The `bindings` map is therefore empty here. PR 5 lands
 * the first batch of game-module blocks (check-in / shop / lottery /
 * cdkey / leaderboard / mail) and populates this map.
 *
 * Why a separate file from `catalog.ts`?
 *   - The catalog is consumed by the LLM (zod prop schema + description).
 *     It must NOT pull in `cloudflare:workers`-specific code.
 *   - The bindings are consumed by the pages worker's SSR loader.
 *     They can reference module client-call helpers that themselves
 *     touch service bindings.
 *   - Splitting the two means the catalog tree-shakes cleanly into
 *     the admin / agent bundle, and the bindings tree-shake into the
 *     pages worker bundle.
 */

import type { BlockBinding, BlockNode } from "./schema.js";

/**
 * Result of an SSR loader call. The block component reads `data` to
 * render; `error` lets the component show a friendly fallback.
 */
export interface BlockSSRData {
  data: unknown;
  error: { code: string; message: string } | null;
}

/**
 * SSR loader signature. The pages worker provides a `fetchClient`
 * helper that already has cpk auth + tenant context resolved; bindings
 * just compose the path and parse the result.
 */
export type BlockSSRLoader = (
  binding: BlockBinding,
  block: BlockNode,
  ctx: BlockSSRContext,
) => Promise<BlockSSRData>;

/**
 * Context passed to every loader. The pages worker constructs this
 * from the active project + the resolved end-user identity.
 */
export interface BlockSSRContext {
  projectId: string;
  tenantId: string;
  endUserId: string | null;
  /**
   * Path-style fetch against `/api/v1/client/*` — already authenticated
   * with the project's cpk and (when applicable) the player's
   * end-user-id + hmac headers. Returns the parsed envelope's `data`
   * field on success or throws on error envelope / non-2xx.
   */
  fetchClient: <T>(input: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: unknown;
  }) => Promise<T>;
}

/**
 * Registered loaders, keyed by `BlockBinding.module`. Each loader is
 * called once per block at SSR time by the pages worker; the result's
 * `data` becomes the block's `initialData` prop.
 *
 * PR 5 introduces stub loaders for the 6 game-module blocks (check-in
 * / shop / lottery / cdkey / leaderboard / mail). Each currently
 * returns `{ data: null }` — pages worker treats null as "render with
 * the AI/operator-supplied static props" so the block still renders
 * even when the loader hasn't been wired to its server endpoint yet.
 *
 * Real `fetchClient` calls land per-module across PR 6+. The loader
 * signature is stable: callers don't change when a loader gains a
 * real implementation.
 */
const stubLoader: BlockSSRLoader = async () => ({ data: null, error: null });

export const moduleLoaders: Record<string, BlockSSRLoader> = {
  "check-in": stubLoader,
  shop: stubLoader,
  lottery: stubLoader,
  cdkey: stubLoader,
  leaderboard: stubLoader,
  mail: stubLoader,
  badge: stubLoader,
  // `activity-form` block writes to page_form_submissions but does not
  // read game-module data — no loader needed beyond the stub. The
  // pages worker still injects projectId/pageId/blockId via initialData
  // so the form's hidden inputs come out filled.
};

/**
 * Resolve the loader for a given binding, or `undefined` if the module
 * has no registered loader (in which case the renderer falls back to a
 * client-only render — the block ships its own fetch on hydrate).
 */
export function resolveLoader(
  binding: BlockBinding | undefined,
): BlockSSRLoader | undefined {
  if (!binding) return undefined;
  return moduleLoaders[binding.module];
}
