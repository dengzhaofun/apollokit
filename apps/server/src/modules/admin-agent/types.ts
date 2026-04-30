import type { UIMessage } from "ai";

import type { AdminAgentName } from "./agents/types";
import type { MentionRef } from "./mentions/types";

/**
 * The "surface" string the admin frontend sends with each chat request.
 * Format:
 *   - `"dashboard"` for the main page
 *   - `"<module>:<intent>"` where intent ∈ {list, create, edit}
 *
 * Surface drives:
 *   1. Which tools are exposed to the model (see `tools/index.ts`).
 *   2. Which sub-prompt is concatenated into the system prompt
 *      (see `prompts.ts`).
 *
 * Adding a new module that the admin can navigate to = add it to
 * `ADMIN_MODULES` below. Tool registration / sub-prompt is independent —
 * a module can be on the surface whitelist without yet having an apply
 * tool (FAB will still work, just in query-only mode).
 */

const ADMIN_INTENTS = ["list", "create", "edit"] as const;
type AdminIntent = (typeof ADMIN_INTENTS)[number];

/**
 * Every business module the admin SPA mounts a route for. Mirrors the
 * module routers registered in `src/index.ts`. Pad it eagerly: the cost
 * of an extra entry is zero, but a missing entry causes the FAB to 400
 * on that page.
 */
export const ADMIN_MODULES = [
  "activity",
  "analytics",
  "announcement",
  "assist-pool",
  "badge",
  "banner",
  "battle-pass",
  "cdkey",
  "character",
  "check-in",
  "client-credentials",
  "cms",
  "collection",
  "currency",
  "dialogue",
  "entity",
  "event-catalog",
  "exchange",
  "friend",
  "friend-gift",
  "guild",
  "invite",
  "leaderboard",
  "level",
  "lottery",
  "mail",
  "media-library",
  "navigation",
  "rank",
  "shop",
  "storage-box",
  "task",
  "team",
  "webhooks",
] as const;
export type AdminModule = (typeof ADMIN_MODULES)[number];

export type AdminSurface =
  | "dashboard"
  | `${AdminModule}:${AdminIntent}`;

const ADMIN_MODULES_SET: ReadonlySet<string> = new Set(ADMIN_MODULES);
const ADMIN_INTENTS_SET: ReadonlySet<string> = new Set(ADMIN_INTENTS);

export function isAdminSurface(s: unknown): s is AdminSurface {
  if (typeof s !== "string") return false;
  if (s === "dashboard") return true;
  const colonIdx = s.indexOf(":");
  if (colonIdx < 0) return false;
  const moduleName = s.slice(0, colonIdx);
  const intent = s.slice(colonIdx + 1);
  return ADMIN_MODULES_SET.has(moduleName) && ADMIN_INTENTS_SET.has(intent);
}

/** Strip `:create` / `:edit` / `:list` to get the module name. `null` for `dashboard`. */
export function moduleOf(surface: AdminSurface): AdminModule | null {
  if (surface === "dashboard") return null;
  return surface.split(":")[0] as AdminModule;
}

export type ChatRequestBody = {
  messages: UIMessage[];
  /**
   * Which admin agent should handle this turn. The two current agents
   * differ in **behavior policy**, not capability: form-fill returns
   * propose-only patch/apply tool calls (frontend confirms before any
   * write), global-assistant's patch tool calls write to module services
   * directly. See `agents/types.ts` for the registry.
   */
  agentName: AdminAgentName;
  context: {
    surface: AdminSurface;
    /**
     * Snapshot of the current form values the user has filled in. Sent so
     * the agent can treat already-filled fields as constraints and only
     * propose values for the missing ones.
     */
    draft?: Record<string, unknown>;
    /**
     * Resources the user @-mentioned in the current message. The frontend
     * sends only `{ type, id }` references — the server re-fetches the
     * authoritative snapshot via `descriptor.fetch` (org-scoped) and
     * injects the result into the system prompt + extends the toolset
     * with the corresponding apply tool. Optional & backwards-compat.
     */
    mentions?: MentionRef[];
  };
};

/**
 * Per-request context the route handler captures from the Hono session
 * and threads into the service. Query tools' `execute` closures need
 * `organizationId` to scope DB reads to the correct tenant.
 */
export type ChatExecutionContext = {
  organizationId: string;
};
