/**
 * Mention protocol types — frontend mirror of
 * `apps/server/src/modules/admin-agent/mentions/types.ts`.
 *
 * Kept inline (not codegenned) because the chat endpoint is not in the
 * OpenAPI spec — see `apps/server/src/modules/admin-agent/routes.ts` for
 * why. If/when this protocol grows complex enough to need formal typing,
 * promote it to a shared package.
 */

export type MentionRef = {
  type: string
  id: string
}

export type MentionResult = {
  type: string
  id: string
  alias?: string | null
  name: string
  subtitle?: string | null
}

export type MentionType = {
  type: string
  label: string
  /** True if mentioning enables apply tools (writable). */
  writable: boolean
}
