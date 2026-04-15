/**
 * Frontend-side mirror of the backend `LinkAction` value object.
 * Keep this in sync with `apps/server/src/modules/link/types.ts` and
 * `apps/server/src/modules/link/registry.ts`.
 *
 * Every admin form that configures a clickable element (banner, dialogue
 * option, …) should edit a `LinkAction` via the shared `LinkActionEditor`.
 * This module also exposes the route registry (label + param shape +
 * active/pending status) so the editor can render the right controls.
 */

export type LinkActionNone = { type: "none" }
export type LinkActionExternal = {
  type: "external"
  url: string
  openIn?: "_blank" | "_self"
}
export type LinkActionInternal = {
  type: "internal"
  route: InternalRoute
  params?: Record<string, string>
}
export type LinkAction = LinkActionNone | LinkActionExternal | LinkActionInternal

export type LinkActionKind = LinkAction["type"]

export type InternalRoute =
  | "home"
  | "check-in"
  | "mail.inbox"
  | "mail.detail"
  | "shop.home"
  | "shop.category"
  | "shop.product"
  | "shop.growth-pack"
  | "lottery.pool"
  | "dialogue.script"
  | "friend.list"
  | "friend.detail"
  | "guild.home"
  | "guild.detail"
  | "leaderboard"
  | "quest.list"
  | "quest.detail"
  | "activity.list"
  | "activity.detail"
  | "inventory"

export type LinkParamType = "uuid" | "string"

export type LinkParamSpec = {
  key: string
  type: LinkParamType
  optional?: boolean
}

export type LinkRouteDefinition = {
  route: InternalRoute
  status: "active" | "pending"
  label: string
  params: LinkParamSpec[]
}

/**
 * Keep this table in sync with `LINK_ROUTE_REGISTRY` on the server
 * (apps/server/src/modules/link/registry.ts). `label` is shown in the
 * editor UI; a dedicated i18n key would be overkill for these since the
 * route names themselves are stable English identifiers.
 */
export const LINK_ROUTES: LinkRouteDefinition[] = [
  { route: "home", status: "active", label: "Home", params: [] },
  { route: "check-in", status: "active", label: "Check-in", params: [] },
  { route: "mail.inbox", status: "active", label: "Mail · Inbox", params: [] },
  {
    route: "mail.detail",
    status: "active",
    label: "Mail · Detail",
    params: [{ key: "messageId", type: "uuid" }],
  },
  { route: "shop.home", status: "active", label: "Shop · Home", params: [] },
  {
    route: "shop.category",
    status: "active",
    label: "Shop · Category",
    params: [{ key: "categoryId", type: "uuid" }],
  },
  {
    route: "shop.product",
    status: "active",
    label: "Shop · Product",
    params: [{ key: "productId", type: "uuid" }],
  },
  {
    route: "shop.growth-pack",
    status: "active",
    label: "Shop · Growth Pack",
    params: [{ key: "productId", type: "uuid" }],
  },
  {
    route: "lottery.pool",
    status: "active",
    label: "Lottery · Pool",
    params: [{ key: "poolId", type: "uuid" }],
  },
  {
    route: "dialogue.script",
    status: "active",
    label: "Dialogue · Script",
    params: [{ key: "scriptAlias", type: "string" }],
  },
  { route: "friend.list", status: "pending", label: "Friend · List", params: [] },
  {
    route: "friend.detail",
    status: "pending",
    label: "Friend · Detail",
    params: [{ key: "friendEndUserId", type: "string" }],
  },
  { route: "guild.home", status: "pending", label: "Guild · Home", params: [] },
  {
    route: "guild.detail",
    status: "pending",
    label: "Guild · Detail",
    params: [{ key: "guildId", type: "uuid" }],
  },
  {
    route: "leaderboard",
    status: "pending",
    label: "Leaderboard",
    params: [{ key: "type", type: "string", optional: true }],
  },
  { route: "quest.list", status: "pending", label: "Quest · List", params: [] },
  {
    route: "quest.detail",
    status: "pending",
    label: "Quest · Detail",
    params: [{ key: "questId", type: "uuid" }],
  },
  { route: "activity.list", status: "pending", label: "Activity · List", params: [] },
  {
    route: "activity.detail",
    status: "pending",
    label: "Activity · Detail",
    params: [{ key: "activityId", type: "uuid" }],
  },
  { route: "inventory", status: "pending", label: "Inventory", params: [] },
]

export function getLinkRouteDefinition(
  route: string,
): LinkRouteDefinition | undefined {
  return LINK_ROUTES.find((r) => r.route === route)
}

export function describeLinkAction(action: LinkAction): string {
  switch (action.type) {
    case "none":
      return "—"
    case "external":
      return action.url
    case "internal": {
      const def = getLinkRouteDefinition(action.route)
      const label = def?.label ?? action.route
      const params = action.params
        ? Object.entries(action.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : ""
      return params ? `${label} (${params})` : label
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Client-side equivalent of the backend `LinkActionSchema` refine. Returns
 * a user-friendly error message, or null when the action is valid.
 *
 * The backend is the source of truth — this is just an eager check so
 * forms can surface problems before hitting the server.
 */
export function validateLinkAction(action: LinkAction): string | null {
  if (action.type === "none") return null
  if (action.type === "external") {
    if (!action.url) return "URL required"
    if (!/^https?:\/\//.test(action.url))
      return "URL must start with http:// or https://"
    return null
  }
  // internal
  const def = getLinkRouteDefinition(action.route)
  if (!def) return `Unknown route: ${action.route}`
  for (const spec of def.params) {
    const raw = action.params?.[spec.key]
    if (!raw || raw.length === 0) {
      if (spec.optional) continue
      return `Missing param: ${spec.key}`
    }
    if (spec.type === "uuid" && !UUID_RE.test(raw)) {
      return `${spec.key} must be a UUID`
    }
  }
  return null
}
