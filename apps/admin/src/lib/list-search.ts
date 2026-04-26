import { z } from "zod"

/**
 * Standard search-params shape for URL-driven list pages.
 *
 * Routes hosting a server-paginated list should merge this into their
 * `validateSearch` together with `modalSearchSchema` (for modal state)
 * and the per-module filter fragment exported by the module's
 * `defineListFilter` (server) / matching admin schema.
 *
 * Wire keys (kept stable across modules so the URL contract is uniform):
 *   q         debounced search term, free-text
 *   cursor    opaque cursor returned from the previous page's response
 *   pageSize  page size (1..200) — persists in URL so deep links keep size
 *   adv       base64url(JSON) advanced filter expression
 *   mode      "advanced" when the user has flipped the toolbar toggle
 *
 * `passthrough()` lets each route layer additional, module-specific
 * filter keys (status, categoryId, createdAtGte/Lte, …) on top of this
 * base without rewriting the schema. Each route SHOULD still merge in
 * its module's `adminQueryFragment` so unknown filter keys can't sneak
 * through silently.
 */
export const listSearchSchema = z
  .object({
    q: z.string().optional(),
    cursor: z.string().optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    adv: z.string().optional(),
    mode: z.enum(["basic", "advanced"]).optional(),
  })
  .passthrough()

export type ListSearch = z.infer<typeof listSearchSchema>

/** Sentinel values for `setSearch` calls that mean "drop this key". */
export const RESET_LIST_SEARCH = {
  q: undefined,
  cursor: undefined,
  pageSize: undefined,
  adv: undefined,
  mode: undefined,
} as const satisfies Pick<ListSearch, "q" | "cursor" | "pageSize" | "adv" | "mode">

/**
 * URL-encode a base64url JSON value. The advanced AST is too rich for
 * flat query keys (nested AND/OR groups), so we ship the JSON whole.
 *
 * Returns `undefined` for empty / no-rules input so callers can pass
 * the result straight to `setSearch({ adv: encode(ast) })` and have it
 * drop the key when the builder is empty.
 */
export function encodeAdvancedAst(
  ast: unknown,
): string | undefined {
  if (!ast || typeof ast !== "object") return undefined
  const json = JSON.stringify(ast)
  return base64url(json)
}

export function decodeAdvancedAst(
  encoded: string | undefined,
): unknown {
  if (!encoded) return undefined
  try {
    return JSON.parse(b64urlDecode(encoded))
  } catch {
    return undefined
  }
}

function base64url(input: string): string {
  // Browser-friendly base64url (no Buffer dependency).
  const utf8 = new TextEncoder().encode(input)
  let bin = ""
  for (const byte of utf8) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const bin = atob(padded + padding)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
