/**
 * Typed errors for the entity module.
 *
 * Service methods throw these subclasses. The HTTP layer maps them
 * onto JSON responses via the router's onError handler.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class EntitySchemaNotFound extends ModuleError {
  constructor(key: string) {
    super("entity.schema_not_found", 404, `entity schema not found: ${key}`);
    this.name = "EntitySchemaNotFound";
  }
}

export class EntityBlueprintNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "entity.blueprint_not_found",
      404,
      `entity blueprint not found: ${key}`,
    );
    this.name = "EntityBlueprintNotFound";
  }
}

export class EntitySkinNotFound extends ModuleError {
  constructor(id: string) {
    super("entity.skin_not_found", 404, `entity skin not found: ${id}`);
    this.name = "EntitySkinNotFound";
  }
}

export class EntityInstanceNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "entity.instance_not_found",
      404,
      `entity instance not found: ${id}`,
    );
    this.name = "EntityInstanceNotFound";
  }
}

export class EntityFormationConfigNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "entity.formation_config_not_found",
      404,
      `entity formation config not found: ${key}`,
    );
    this.name = "EntityFormationConfigNotFound";
  }
}

export class EntityAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "entity.alias_conflict",
      409,
      `entity alias already in use: ${alias}`,
    );
    this.name = "EntityAliasConflict";
  }
}

export class EntityInvalidInput extends ModuleError {
  constructor(message: string) {
    super("entity.invalid_input", 400, message);
    this.name = "EntityInvalidInput";
  }
}

export class EntityMaxLevelReached extends ModuleError {
  constructor() {
    super("entity.max_level_reached", 409, "entity is already at max level");
    this.name = "EntityMaxLevelReached";
  }
}

export class EntityMaxRankReached extends ModuleError {
  constructor() {
    super("entity.max_rank_reached", 409, "entity is already at max rank");
    this.name = "EntityMaxRankReached";
  }
}

export class EntityLocked extends ModuleError {
  constructor() {
    super("entity.locked", 409, "entity is locked and cannot be modified");
    this.name = "EntityLocked";
  }
}

export class EntityAlreadyEquipped extends ModuleError {
  constructor() {
    super(
      "entity.already_equipped",
      409,
      "entity is already equipped in another slot",
    );
    this.name = "EntityAlreadyEquipped";
  }
}

export class EntitySlotIncompatible extends ModuleError {
  constructor(message: string) {
    super("entity.slot_incompatible", 409, message);
    this.name = "EntitySlotIncompatible";
  }
}

export class EntitySlotOccupied extends ModuleError {
  constructor() {
    super("entity.slot_occupied", 409, "slot is already occupied");
    this.name = "EntitySlotOccupied";
  }
}

export class EntitySynthesisInvalid extends ModuleError {
  constructor(message: string) {
    super("entity.synthesis_invalid", 409, message);
    this.name = "EntitySynthesisInvalid";
  }
}

export class EntityConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "entity.concurrency_conflict",
      409,
      "entity was modified concurrently — retry the operation",
    );
    this.name = "EntityConcurrencyConflict";
  }
}

export class EntityInsufficientMaterials extends ModuleError {
  constructor() {
    super(
      "entity.insufficient_materials",
      409,
      "insufficient materials for this operation",
    );
    this.name = "EntityInsufficientMaterials";
  }
}
