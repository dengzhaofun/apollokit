/**
 * Unified reward system — polymorphic reward entries.
 *
 * Every reward/cost column across all modules stores `RewardEntry[]`.
 * Each entry has a `type` discriminator that tells the dispatch
 * function where to send it.
 *
 * Adding a new reward type (points, external goods, etc.) requires:
 *   1. Add the new type to the `RewardType` union
 *   2. Add a `case` in `grantRewards()`
 *   3. Done — no schema migrations, no new columns
 */

/**
 * Supported reward types. Extend this union to add new types.
 *
 *   - "item"   → dispatched to itemService.grantItems (id = definitionId)
 *   - "entity" → dispatched to entityService.acquireEntity (id = blueprintId)
 *
 * Future: "points", "external", "currency", etc.
 */
export type RewardType = "item" | "entity";

/**
 * A single polymorphic reward/cost entry.
 *
 * Stored in JSONB arrays across all reward columns. The `type` field
 * determines which service handles the grant/deduction.
 *
 *   { type: "item",   id: "gold-def-uuid",        count: 100 }
 *   { type: "entity", id: "fire-warrior-bp-uuid",  count: 1   }
 */
export type RewardEntry = {
  type: RewardType;
  id: string;
  count: number;
};

/** Type guard: does this array contain any entries? */
export function hasRewards(
  entries: RewardEntry[] | null | undefined,
): boolean {
  return entries != null && entries.length > 0;
}

/** Filter entries by type. */
export function filterByType(
  entries: RewardEntry[],
  type: RewardType,
): RewardEntry[] {
  return entries.filter((e) => e.type === type);
}

// ─── Service interfaces (avoids circular imports) ───────────────

export type RewardItemSvc = {
  grantItems: (params: {
    organizationId: string;
    endUserId: string;
    grants: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }) => Promise<unknown>;
  deductItems: (params: {
    organizationId: string;
    endUserId: string;
    deductions: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }) => Promise<unknown>;
};

export type RewardEntitySvc = {
  acquireEntity: (
    organizationId: string,
    endUserId: string,
    blueprintId: string,
    source: string,
    sourceId?: string,
  ) => Promise<unknown>;
};

export type RewardServices = {
  itemSvc: RewardItemSvc;
  entitySvc?: RewardEntitySvc;
};

/**
 * Grant an array of reward entries to an end user.
 *
 * Groups entries by type and dispatches to the appropriate service.
 * Items are batched into a single grantItems call; entities are
 * acquired one-by-one (each is a unique instance).
 */
export async function grantRewards(
  services: RewardServices,
  organizationId: string,
  endUserId: string,
  entries: RewardEntry[],
  source: string,
  sourceId?: string,
): Promise<void> {
  // Batch items into one grantItems call
  const items = filterByType(entries, "item");
  if (items.length > 0) {
    await services.itemSvc.grantItems({
      organizationId,
      endUserId,
      grants: items.map((e) => ({ definitionId: e.id, quantity: e.count })),
      source,
      sourceId,
    });
  }

  // Acquire entities one-by-one (each is a unique instance)
  const entities = filterByType(entries, "entity");
  if (entities.length > 0 && services.entitySvc) {
    for (const entry of entities) {
      for (let i = 0; i < entry.count; i++) {
        await services.entitySvc.acquireEntity(
          organizationId,
          endUserId,
          entry.id,
          source,
          sourceId,
        );
      }
    }
  }

  // Future: add cases for "points", "external", etc.
}

/**
 * Deduct costs from an end user. Only "item" type is supported
 * for deduction (you can't un-acquire an entity as a cost — use
 * entity synthesis/discard for that).
 */
export async function deductCosts(
  services: RewardServices,
  organizationId: string,
  endUserId: string,
  entries: RewardEntry[],
  source: string,
  sourceId?: string,
): Promise<void> {
  const items = filterByType(entries, "item");
  if (items.length > 0) {
    await services.itemSvc.deductItems({
      organizationId,
      endUserId,
      deductions: items.map((e) => ({
        definitionId: e.id,
        quantity: e.count,
      })),
      source,
      sourceId,
    });
  }

  // Future: add cases for "points" deduction, etc.
}

