/**
 * Canonical polymorphic reward entry — mirrors the server's
 * `lib/rewards.ts` `RewardEntry` shape exactly. Every cost/reward JSONB
 * column on the server is stored in this format, and every admin form
 * that edits such a field must emit/consume entries of this shape.
 *
 *   { type: "item",     id: "<item_definitions.id>",   count: 100 }
 *   { type: "currency", id: "<currencies.id>",          count: 50 }
 *   { type: "entity",   id: "<entity_blueprints.id>",   count: 1  }
 *
 * Do NOT re-define `RewardEntry` in per-module type files. Import from
 * here. (Legacy `{definitionId, quantity}` shape from
 * `lib/types/item.ts` is retained only for the item grant/deduct admin
 * API, which hits `itemService` directly.)
 */

export type RewardType = "item" | "entity" | "currency"

export interface RewardEntry {
  type: RewardType
  id: string
  count: number
}
