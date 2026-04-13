import type {
  itemCategories,
  itemDefinitions,
  itemGrantLogs,
  itemInventories,
} from "../../schema/item";

export type ItemCategory = typeof itemCategories.$inferSelect;
export type ItemDefinition = typeof itemDefinitions.$inferSelect;
export type ItemInventory = typeof itemInventories.$inferSelect;
export type ItemGrantLog = typeof itemGrantLogs.$inferSelect;

/**
 * A single item entry used across all jsonb columns that reference
 * item_definitions (check-in rewards, exchange cost/reward, grant API).
 * This is the canonical shape — schema `.$type<>()` annotations and
 * validator schemas all point back here.
 */
export type ItemEntry = {
  definitionId: string;
  quantity: number;
};

/** @deprecated Use `ItemEntry` — kept as alias for back-compat. */
export type GrantEntry = ItemEntry;

export type GrantResult = {
  grants: Array<{
    definitionId: string;
    quantityBefore: number;
    quantityAfter: number;
    delta: number;
  }>;
};

export type DeductResult = {
  deductions: Array<{
    definitionId: string;
    quantityBefore: number;
    quantityAfter: number;
    delta: number;
  }>;
};

export type InventoryView = {
  definitionId: string;
  definitionAlias: string | null;
  definitionName: string;
  icon: string | null;
  stackable: boolean;
  totalQuantity: number;
  stacks: Array<{
    id: string;
    quantity: number;
    instanceData: unknown;
  }>;
};
