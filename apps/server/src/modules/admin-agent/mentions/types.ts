/**
 * Mention types — the data shapes flowing through the @-mention pipeline.
 *
 *   ┌──────────┐   search   ┌────────────────┐
 *   │ frontend │──────────▶ │ MentionResult  │ (popover row)
 *   └──────────┘            └────────────────┘
 *        │ submit chat
 *        ▼ (compact ref)
 *   ┌──────────┐   resolve  ┌────────────────┐
 *   │ MentionRef│─────────▶ │ MentionSnapshot│ (LLM context line + tool dispatch hint)
 *   └──────────┘            └────────────────┘
 *
 * The frontend sends only `MentionRef` to keep payloads small and untrusted.
 * The server re-fetches via `descriptor.fetch` to get the current snapshot
 * before injecting into the LLM context.
 */

/**
 * Compact reference the frontend sends in chat request body.
 *
 * `id` is whatever key the descriptor accepts in `fetch` — usually a UUID,
 * but for modules whose `get` only accepts an alias (e.g. announcement),
 * the descriptor returns the alias as the `id` field. The opaque-key
 * convention is the same as `queryModule`'s `key` parameter.
 */
export type MentionRef = {
  type: string;
  id: string;
};

/**
 * One row in the mention search popover. Lightweight by design — the
 * `subtitle` is short metadata (status, period, …) for disambiguation,
 * not the full resource.
 */
export type MentionResult = {
  type: string;
  id: string;
  alias?: string | null;
  name: string;
  subtitle?: string | null;
};

/**
 * Server-side resolved mention. `resource` is the raw module shape;
 * `contextLine` is the descriptor-formatted summary for the LLM system
 * prompt; `toolModuleId` indicates which apply-tool module to enable
 * (null if the module has no apply tool registered yet — read-only mention).
 */
export type MentionSnapshot = {
  ref: MentionRef;
  resource: unknown;
  contextLine: string;
  toolModuleId: string | null;
};

/**
 * One entry in the mention type registry. Each Tier-1 module contributes
 * one descriptor; new mentionable resources = one descriptor + one
 * registration call.
 *
 * Generic over `T` so descriptor authors get type safety on the resource
 * shape they pass between `search`/`fetch`/`toResult`/`toContextLine`.
 * The registry erases `T` to `unknown` — that's fine, only the descriptor
 * itself touches the typed resource.
 */
export type MentionDescriptor<T = unknown> = {
  /** Stable id used in URLs and the chat protocol. e.g. `"check-in"`. */
  type: string;
  /** Human-readable label for the popover tab. */
  label: string;
  /**
   * Apply-tool module key the chat service should add to the toolset
   * when this type is mentioned. Must be a key in `APPLY_TOOL_BY_MODULE`,
   * or `null` if the module has no apply tool yet (mention will be
   * read-only — AI sees the snapshot but can't propose changes).
   */
  toolModuleId: string | null;
  /**
   * Search candidate resources. `q` empty/undefined means "default
   * recommendations" (descriptors typically return most-recent N).
   */
  search(orgId: string, q: string | undefined, limit: number): Promise<MentionResult[]>;
  /**
   * Re-fetch the resource by id (or alias for modules without UUID get).
   * Returns null when the resource no longer exists; callers downgrade
   * to a "[已失效]" line instead of throwing.
   */
  fetch(orgId: string, id: string): Promise<T | null>;
  /** Map a typed resource to a popover row. */
  toResult(item: T): MentionResult;
  /**
   * One-line description for the LLM system prompt. Keep it tight —
   * type, name, key identifying fields. The LLM aggregates across many
   * mentioned resources, so per-line bloat compounds.
   */
  toContextLine(item: T): string;
};
