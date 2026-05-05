export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class PageProjectNotFound extends ModuleError {
  constructor(idOrSlug: string) {
    super("page.project_not_found", 404, `page project not found: ${idOrSlug}`);
    this.name = "PageProjectNotFound";
  }
}

export class PageProjectSlugConflict extends ModuleError {
  constructor(slug: string) {
    super(
      "page.slug_conflict",
      409,
      `page project slug already exists: ${slug}`,
    );
    this.name = "PageProjectSlugConflict";
  }
}

export class PageProjectSlugReserved extends ModuleError {
  constructor(slug: string) {
    super(
      "page.slug_reserved",
      400,
      `page project slug is reserved: ${slug}`,
    );
    this.name = "PageProjectSlugReserved";
  }
}

export class PageVersionNotFound extends ModuleError {
  constructor(idOrNumber: string | number) {
    super(
      "page.version_not_found",
      404,
      `page project version not found: ${idOrNumber}`,
    );
    this.name = "PageVersionNotFound";
  }
}

export class PageVersionMismatch extends ModuleError {
  constructor(message: string) {
    super("page.version_mismatch", 400, message);
    this.name = "PageVersionMismatch";
  }
}

export class PageTemplateNotFound extends ModuleError {
  constructor(idOrSlug: string) {
    super("page.template_not_found", 404, `page template not found: ${idOrSlug}`);
    this.name = "PageTemplateNotFound";
  }
}

export class PageInvalidSchema extends ModuleError {
  constructor(message: string) {
    super("page.invalid_schema", 400, message);
    this.name = "PageInvalidSchema";
  }
}

export class PageBoundModuleViolation extends ModuleError {
  constructor(missingModules: string[]) {
    super(
      "page.bound_module_violation",
      400,
      `schema references modules not in project.boundModules: ${missingModules.join(", ")}`,
    );
    this.name = "PageBoundModuleViolation";
  }
}

export class PagePreviewTokenInvalid extends ModuleError {
  constructor(reason: string) {
    super("page.preview_token_invalid", 401, `preview token invalid: ${reason}`);
    this.name = "PagePreviewTokenInvalid";
  }
}
