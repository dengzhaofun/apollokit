/**
 * Unified reward system — polymorphic reward entries.
 *
 * Every reward/cost column across all modules stores `RewardEntry[]`.
 * Each entry has a `type` discriminator that tells the dispatch
 * function where to send it.
 *
 * Adding a new reward type (external goods, etc.) requires:
 *   1. Add the new type to the `RewardType` union
 *   2. Add a `case` in `grantRewards()` (and `deductCosts()` if deductible)
 *   3. Done — no schema migrations, no new columns
 */

/**
 * Supported reward types. Extend this union to add new types.
 *
 *   - "item"     → dispatched to itemService.grantItems      (id = definitionId)
 *   - "entity"   → dispatched to entityService.acquireEntity (id = blueprintId)
 *   - "currency" → dispatched to currencyService.grant       (id = currencyId)
 *
 * Future: "external", etc.
 */
export type RewardType = "item" | "entity" | "currency";

/**
 * A single polymorphic reward/cost entry.
 *
 * Stored in JSONB arrays across all reward columns. The `type` field
 * determines which service handles the grant/deduction.
 *
 *   { type: "item",     id: "gold-def-uuid",         count: 100 }
 *   { type: "entity",   id: "fire-warrior-bp-uuid",  count: 1   }
 *   { type: "currency", id: "gem-cur-uuid",          count: 50  }
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

/**
 * Cross-cutting context for grants/deductions that happen inside an
 * activity scope. Optional — non-activity contexts (shop purchase,
 * direct admin grant, …) pass nothing and behavior is unchanged.
 *
 * When set, the underlying ledger / grant_logs row will record these
 * columns so audit queries like "what did activity X pay out in
 * permanent gold?" become a single WHERE clause.
 */
export type RewardContext = {
  activityId?: string;
  activityNodeId?: string;
};

export type RewardItemSvc = {
  grantItems: (params: {
    tenantId: string;
    endUserId: string;
    grants: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
    context?: RewardContext;
  }) => Promise<unknown>;
  deductItems: (params: {
    tenantId: string;
    endUserId: string;
    deductions: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
    context?: RewardContext;
  }) => Promise<unknown>;
};

export type RewardEntitySvc = {
  acquireEntity: (
    tenantId: string,
    endUserId: string,
    blueprintId: string,
    source: string,
    sourceId?: string,
    context?: RewardContext,
  ) => Promise<unknown>;
};

export type RewardCurrencySvc = {
  grant: (params: {
    tenantId: string;
    endUserId: string;
    grants: Array<{ currencyId: string; amount: number }>;
    source: string;
    sourceId?: string;
    context?: RewardContext;
  }) => Promise<unknown>;
  deduct: (params: {
    tenantId: string;
    endUserId: string;
    deductions: Array<{ currencyId: string; amount: number }>;
    source: string;
    sourceId?: string;
    context?: RewardContext;
  }) => Promise<unknown>;
};

/**
 * Service bundle threaded through `grantRewards` / `deductCosts`.
 *
 * `currencySvc` is **required** — making it optional would let a consumer
 * module silently drop currency rewards if its wiring forgot to inject the
 * dependency. With a non-optional slot, TypeScript forces every call site
 * to pass the real `currencyService`.
 */
export type RewardServices = {
  itemSvc: RewardItemSvc;
  currencySvc: RewardCurrencySvc;
  entitySvc?: RewardEntitySvc;
};

/**
 * Grant an array of reward entries to an end user.
 *
 * Groups entries by type and dispatches to the appropriate service.
 * Items are batched into a single `grantItems` call; currencies are
 * batched into a single `currencySvc.grant` call; entities are
 * acquired one-by-one (each is a unique instance).
 */
export async function grantRewards(
  services: RewardServices,
  tenantId: string,
  endUserId: string,
  entries: RewardEntry[],
  source: string,
  sourceId?: string,
  context?: RewardContext,
): Promise<void> {
  // Batch items into one grantItems call
  const items = filterByType(entries, "item");
  if (items.length > 0) {
    await services.itemSvc.grantItems({
      tenantId,
      endUserId,
      grants: items.map((e) => ({ definitionId: e.id, quantity: e.count })),
      source,
      sourceId,
      context,
    });
  }

  // Batch currencies into one grant call
  const currencies = filterByType(entries, "currency");
  if (currencies.length > 0) {
    await services.currencySvc.grant({
      tenantId,
      endUserId,
      grants: currencies.map((e) => ({ currencyId: e.id, amount: e.count })),
      source,
      sourceId,
      context,
    });
  }

  // Acquire entities one-by-one (each is a unique instance)
  const entities = filterByType(entries, "entity");
  if (entities.length > 0 && services.entitySvc) {
    for (const entry of entities) {
      for (let i = 0; i < entry.count; i++) {
        await services.entitySvc.acquireEntity(
          tenantId,
          endUserId,
          entry.id,
          source,
          sourceId,
          context,
        );
      }
    }
  }

  // Future: add cases for "external", etc.
}

/**
 * Deduct costs from an end user. Supports `"item"` and `"currency"` types.
 *
 * Entities cannot be used as a cost — use entity synthesis/discard for that.
 */
export async function deductCosts(
  services: RewardServices,
  tenantId: string,
  endUserId: string,
  entries: RewardEntry[],
  source: string,
  sourceId?: string,
  context?: RewardContext,
): Promise<void> {
  const items = filterByType(entries, "item");
  if (items.length > 0) {
    await services.itemSvc.deductItems({
      tenantId,
      endUserId,
      deductions: items.map((e) => ({
        definitionId: e.id,
        quantity: e.count,
      })),
      source,
      sourceId,
      context,
    });
  }

  const currencies = filterByType(entries, "currency");
  if (currencies.length > 0) {
    await services.currencySvc.deduct({
      tenantId,
      endUserId,
      deductions: currencies.map((e) => ({
        currencyId: e.id,
        amount: e.count,
      })),
      source,
      sourceId,
      context,
    });
  }
}
