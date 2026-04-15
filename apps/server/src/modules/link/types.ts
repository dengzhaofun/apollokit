/**
 * Link module — protocol-agnostic "where does this click go?" value object.
 *
 * A `LinkAction` is a serialized logical URL embedded as jsonb inside other
 * modules (banner.linkAction, dialogue option.action, future: push
 * notification deeplinks, event CTA buttons). It is NOT a table — there is
 * no lifecycle of its own — and there are NO HTTP routes here. The only
 * exports are TypeScript types, a runtime registry of internal routes, and
 * a Zod schema.
 *
 * Shape:
 *
 *   none     — no-op click
 *   external — open an external URL (http/https)
 *   internal — navigate to a registered in-app route, optionally with params
 *
 * Internal routes are centrally enumerated in `./registry.ts` so every
 * callsite (admin forms, client rendering, backend validators) can introspect
 * the legal set and the per-route params shape.
 */

import type { InternalRoute } from "./registry";

export type LinkActionNone = { type: "none" };

export type LinkActionExternal = {
  type: "external";
  url: string;
  openIn?: "_blank" | "_self";
};

export type LinkActionInternal = {
  type: "internal";
  route: InternalRoute;
  params?: Record<string, string>;
};

export type LinkAction =
  | LinkActionNone
  | LinkActionExternal
  | LinkActionInternal;

/** Narrowing helpers. */
export function isInternalLink(a: LinkAction): a is LinkActionInternal {
  return a.type === "internal";
}

export function isExternalLink(a: LinkAction): a is LinkActionExternal {
  return a.type === "external";
}
