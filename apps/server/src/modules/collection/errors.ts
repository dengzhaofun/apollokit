/**
 * Typed errors for the collection module.
 *
 * Service methods throw these subclasses. The HTTP layer (routes.ts /
 * client-routes.ts) maps them onto JSON responses via its onError handler.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CollectionAlbumNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "collection.album_not_found",
      404,
      `collection album not found: ${key}`,
    );
    this.name = "CollectionAlbumNotFound";
  }
}

export class CollectionGroupNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "collection.group_not_found",
      404,
      `collection group not found: ${id}`,
    );
    this.name = "CollectionGroupNotFound";
  }
}

export class CollectionEntryNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "collection.entry_not_found",
      404,
      `collection entry not found: ${id}`,
    );
    this.name = "CollectionEntryNotFound";
  }
}

export class CollectionMilestoneNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "collection.milestone_not_found",
      404,
      `collection milestone not found: ${id}`,
    );
    this.name = "CollectionMilestoneNotFound";
  }
}

export class CollectionAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "collection.alias_conflict",
      409,
      `collection alias already in use: ${alias}`,
    );
    this.name = "CollectionAliasConflict";
  }
}

export class CollectionInvalidInput extends ModuleError {
  constructor(message: string) {
    super("collection.invalid_input", 400, message);
    this.name = "CollectionInvalidInput";
  }
}

export class CollectionMilestoneAlreadyClaimed extends ModuleError {
  constructor() {
    super(
      "collection.milestone_already_claimed",
      409,
      "milestone already claimed",
    );
    this.name = "CollectionMilestoneAlreadyClaimed";
  }
}

export class CollectionMilestoneNotReached extends ModuleError {
  constructor() {
    super(
      "collection.milestone_not_reached",
      409,
      "milestone threshold not reached",
    );
    this.name = "CollectionMilestoneNotReached";
  }
}

export class CollectionMilestoneAutoOnly extends ModuleError {
  constructor() {
    super(
      "collection.milestone_auto_only",
      409,
      "milestone is configured as autoClaim — rewards are delivered via mail",
    );
    this.name = "CollectionMilestoneAutoOnly";
  }
}
