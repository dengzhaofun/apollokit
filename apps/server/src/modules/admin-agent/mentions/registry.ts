/**
 * Mention descriptor registry — single per-isolate map of mentionable
 * resource type → descriptor.
 *
 * Mirrors the side-effect registration pattern used by `event-registry`
 * and `apply-registry`: each module's `mentions/<module>.ts` calls
 * `registerMention(...)` at module load; the barrel `mentions/index.ts`
 * imports them all to trigger registration.
 *
 * No DI here — registration is global and idempotent. Tests get a clean
 * registry by importing this module before any descriptor side-effects;
 * production code triggers registration via the barrel import.
 */

import type { MentionDescriptor } from "./types";

const REGISTRY = new Map<string, MentionDescriptor<unknown>>();

/**
 * Register a mention descriptor. Idempotent — re-registering the same
 * type silently overwrites (matches `apply-registry` behavior so HMR /
 * test re-imports don't throw).
 */
export function registerMention<T>(d: MentionDescriptor<T>): void {
  REGISTRY.set(d.type, d as MentionDescriptor<unknown>);
}

/** Look up a descriptor by type. Returns `undefined` for unknown types. */
export function getMention(type: string): MentionDescriptor<unknown> | undefined {
  return REGISTRY.get(type);
}

/**
 * List all registered descriptors. Order is insertion order — descriptors
 * are added in the barrel's import order, which doubles as the popover
 * tab order. Adjust the barrel to control display order.
 */
export function listMentions(): MentionDescriptor<unknown>[] {
  return Array.from(REGISTRY.values());
}

/** Just the type ids — handy for `Set` membership checks. */
export function listMentionTypes(): string[] {
  return Array.from(REGISTRY.keys());
}
