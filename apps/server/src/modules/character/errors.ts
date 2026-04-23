export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CharacterNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "character.not_found",
      404,
      `character not found: ${idOrAlias}`,
    );
    this.name = "CharacterNotFound";
  }
}

export class CharacterAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "character.alias_conflict",
      409,
      `character alias already exists: ${alias}`,
    );
    this.name = "CharacterAliasConflict";
  }
}
