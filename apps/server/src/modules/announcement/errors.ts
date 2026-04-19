export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class AnnouncementNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "announcement.not_found",
      404,
      `announcement not found: ${idOrAlias}`,
    );
    this.name = "AnnouncementNotFound";
  }
}

export class AnnouncementAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "announcement.alias_conflict",
      409,
      `announcement alias already exists: ${alias}`,
    );
    this.name = "AnnouncementAliasConflict";
  }
}

export class AnnouncementInvalidVisibilityWindow extends ModuleError {
  constructor(reason: string) {
    super("announcement.invalid_visibility_window", 400, reason);
    this.name = "AnnouncementInvalidVisibilityWindow";
  }
}
