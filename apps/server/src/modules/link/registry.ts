/**
 * Link registry — the central whitelist of internal routes + their per-route
 * params schemas.
 *
 * Adding a new internal route is a single-file change:
 *   1. Add an entry to `LINK_ROUTE_REGISTRY` below.
 *   2. Give it a `paramsSchema` (use `z.object({}).strict()` for no-params
 *      routes) and a `status` of `"active"` (module already implements the
 *      target view) or `"pending"` (reserved for a future module).
 *   3. That's it — the `InternalRoute` string-union, the OpenAPI enum, and
 *      the Zod validator all derive from this map.
 *
 * The `status` field is informational only:
 *   - both `active` and `pending` routes pass write-time validation, so
 *     operators can configure links ahead of feature launch;
 *   - frontends (admin editor, client renderer) should look at `status` and
 *     surface a "敬请期待" state for `pending` routes rather than crash.
 *
 * **Naming conventions** (keep consistent with existing module APIs):
 *   - route names use dot-notation: `<module>.<view>` (e.g. `shop.product`)
 *   - params use camelCase
 *   - id params follow `<resource>Id` (e.g. `productId`)
 *   - alias/slug params follow `<resource>Alias` (e.g. `scriptAlias`)
 */

import { z } from "@hono/zod-openapi";

/** Canonical "no parameters" schema used by routes with an empty params map. */
const EmptyParams = z.object({}).strict();

const IdParam = (key: string) =>
  z.object({ [key]: z.string().uuid() }).strict();

const AliasParam = (key: string) =>
  z.object({ [key]: z.string().min(1).max(128) }).strict();

const OptionalStringParam = (key: string) =>
  z.object({ [key]: z.string().min(1).max(128).optional() }).strict();

/**
 * The single source of truth for internal routes.
 *
 * `as const satisfies` pattern lets us both enforce the value-shape at
 * compile time AND derive the `InternalRoute` literal union from the keys.
 */
export const LINK_ROUTE_REGISTRY = {
  // ─── Active (module implemented) ───────────────────────────────
  "home": {
    status: "active",
    description: "App home / landing view.",
    paramsSchema: EmptyParams,
  },
  "check-in": {
    status: "active",
    description: "Daily check-in view.",
    paramsSchema: EmptyParams,
  },
  "mail.inbox": {
    status: "active",
    description: "End user's mail inbox.",
    paramsSchema: EmptyParams,
  },
  "mail.detail": {
    status: "active",
    description: "Single mail message detail.",
    paramsSchema: IdParam("messageId"),
  },
  "shop.home": {
    status: "active",
    description: "Shop landing view.",
    paramsSchema: EmptyParams,
  },
  "shop.category": {
    status: "active",
    description: "Shop category browse view.",
    paramsSchema: IdParam("categoryId"),
  },
  "shop.product": {
    status: "active",
    description: "Shop product detail.",
    paramsSchema: IdParam("productId"),
  },
  "shop.growth-pack": {
    status: "active",
    description: "Growth pack (multi-stage product) detail.",
    paramsSchema: IdParam("productId"),
  },
  "lottery.pool": {
    status: "active",
    description: "Lottery pool view.",
    paramsSchema: IdParam("poolId"),
  },
  "dialogue.script": {
    status: "active",
    description: "Trigger a dialogue script by its alias.",
    paramsSchema: AliasParam("scriptAlias"),
  },

  // ─── Pending (reserved for future modules) ─────────────────────
  "friend.list": {
    status: "pending",
    description: "Friend list view (module pending).",
    paramsSchema: EmptyParams,
  },
  "friend.detail": {
    status: "pending",
    description: "Friend profile view (module pending).",
    paramsSchema: z
      .object({ friendEndUserId: z.string().min(1).max(256) })
      .strict(),
  },
  "guild.home": {
    status: "pending",
    description: "Guild home view (module pending).",
    paramsSchema: EmptyParams,
  },
  "guild.detail": {
    status: "pending",
    description: "Guild detail view (module pending).",
    paramsSchema: IdParam("guildId"),
  },
  "leaderboard": {
    status: "pending",
    description: "Leaderboard view (module pending).",
    paramsSchema: OptionalStringParam("type"),
  },
  "quest.list": {
    status: "pending",
    description: "Quest / task list view (module pending).",
    paramsSchema: EmptyParams,
  },
  "quest.detail": {
    status: "pending",
    description: "Quest detail view (module pending).",
    paramsSchema: IdParam("questId"),
  },
  "activity.list": {
    status: "pending",
    description: "Activity list view (module pending).",
    paramsSchema: EmptyParams,
  },
  "activity.detail": {
    status: "pending",
    description: "Activity detail view (module pending).",
    paramsSchema: IdParam("activityId"),
  },
  "inventory": {
    status: "pending",
    description: "Player inventory view (module pending).",
    paramsSchema: EmptyParams,
  },
} as const satisfies Record<
  string,
  {
    status: "active" | "pending";
    description: string;
    paramsSchema: z.ZodType<Record<string, string | undefined>>;
  }
>;

export type InternalRoute = keyof typeof LINK_ROUTE_REGISTRY;

export const INTERNAL_ROUTES = Object.keys(
  LINK_ROUTE_REGISTRY,
) as InternalRoute[];

export function getLinkRouteDefinition(route: InternalRoute) {
  return LINK_ROUTE_REGISTRY[route];
}

export function isInternalRoute(value: string): value is InternalRoute {
  return Object.prototype.hasOwnProperty.call(LINK_ROUTE_REGISTRY, value);
}
