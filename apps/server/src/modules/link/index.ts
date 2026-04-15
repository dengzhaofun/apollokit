/**
 * Link module barrel.
 *
 * No service, no routes, no DB tables — just a typed + validated value
 * object shared across banner, dialogue, and future click-target consumers.
 */

export type {
  LinkAction,
  LinkActionExternal,
  LinkActionInternal,
  LinkActionNone,
} from "./types";
export { isExternalLink, isInternalLink } from "./types";
export {
  INTERNAL_ROUTES,
  LINK_ROUTE_REGISTRY,
  getLinkRouteDefinition,
  isInternalRoute,
} from "./registry";
export type { InternalRoute } from "./registry";
export { LinkActionSchema } from "./validators";
export type { LinkActionInput, LinkActionOutput } from "./validators";
