/**
 * Typed errors for the CMS module.
 *
 * Service methods throw subclasses of `ModuleError`; the router factory's
 * `onError` handler in `lib/openapi.ts` maps them to the standard JSON
 * envelope using `code` + `httpStatus`.
 */

export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CmsTypeNotFound extends ModuleError {
  constructor(key: string) {
    super("cms.type_not_found", 404, `cms type not found: ${key}`);
    this.name = "CmsTypeNotFound";
  }
}

export class CmsTypeAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "cms.type_alias_conflict",
      409,
      `cms type alias already in use in this organization: ${alias}`,
    );
    this.name = "CmsTypeAliasConflict";
  }
}

export class CmsEntryNotFound extends ModuleError {
  constructor(key: string) {
    super("cms.entry_not_found", 404, `cms entry not found: ${key}`);
    this.name = "CmsEntryNotFound";
  }
}

export class CmsEntryAliasConflict extends ModuleError {
  constructor(typeAlias: string, alias: string) {
    super(
      "cms.entry_alias_conflict",
      409,
      `cms entry alias already in use for type ${typeAlias}: ${alias}`,
    );
    this.name = "CmsEntryAliasConflict";
  }
}

export class CmsEntryVersionConflict extends ModuleError {
  constructor(id: string) {
    super(
      "cms.entry_version_conflict",
      409,
      `cms entry was modified concurrently: ${id}`,
    );
    this.name = "CmsEntryVersionConflict";
  }
}

export class CmsInvalidSchema extends ModuleError {
  constructor(message: string) {
    super("cms.invalid_schema", 400, message);
    this.name = "CmsInvalidSchema";
  }
}

export class CmsInvalidData extends ModuleError {
  constructor(message: string) {
    super("cms.invalid_data", 400, message);
    this.name = "CmsInvalidData";
  }
}

export class CmsBreakingSchemaChange extends ModuleError {
  constructor(message: string) {
    super("cms.breaking_schema_change", 400, message);
    this.name = "CmsBreakingSchemaChange";
  }
}

export class CmsInvalidGroup extends ModuleError {
  constructor(group: string) {
    super(
      "cms.invalid_group",
      400,
      `group is not in the type's groupOptions whitelist: ${group}`,
    );
    this.name = "CmsInvalidGroup";
  }
}
