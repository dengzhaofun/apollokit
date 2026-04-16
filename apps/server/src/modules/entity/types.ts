import type {
  entityActionLogs,
  entityBlueprints,
  entityBlueprintSkins,
  entityFormationConfigs,
  entityFormations,
  entityInstances,
  entitySchemas,
  entitySlotAssignments,
} from "../../schema/entity";

/**
 * Drizzle `$inferSelect` re-exports — the authoritative row shapes.
 * Schema changes propagate automatically.
 */
export type EntitySchema = typeof entitySchemas.$inferSelect;
export type EntityBlueprint = typeof entityBlueprints.$inferSelect;
export type EntityBlueprintSkin = typeof entityBlueprintSkins.$inferSelect;
export type EntityInstance = typeof entityInstances.$inferSelect;
export type EntitySlotAssignment = typeof entitySlotAssignments.$inferSelect;
export type EntityFormationConfig = typeof entityFormationConfigs.$inferSelect;
export type EntityFormation = typeof entityFormations.$inferSelect;
export type EntityActionLog = typeof entityActionLogs.$inferSelect;

/**
 * Canonical entry for referencing an entity blueprint in reward/cost
 * JSONB columns (analogous to ItemEntry for items).
 */
export type EntityEntry = {
  blueprintId: string;
  count: number;
};

/** Actions recorded in entity_action_logs. */
export const ENTITY_ACTIONS = [
  "acquire",
  "discard",
  "level_up",
  "add_exp",
  "rank_up",
  "synthesize",
  "equip",
  "unequip",
  "change_skin",
  "lock",
  "unlock",
] as const;
export type EntityAction = (typeof ENTITY_ACTIONS)[number];
