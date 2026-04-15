export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class BannerGroupNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "banner.group_not_found",
      404,
      `banner group not found: ${idOrAlias}`,
    );
    this.name = "BannerGroupNotFound";
  }
}

export class BannerGroupAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "banner.group_alias_conflict",
      409,
      `banner group alias already exists: ${alias}`,
    );
    this.name = "BannerGroupAliasConflict";
  }
}

export class BannerNotFound extends ModuleError {
  constructor(id: string) {
    super("banner.not_found", 404, `banner not found: ${id}`);
    this.name = "BannerNotFound";
  }
}

export class BannerInvalidTarget extends ModuleError {
  constructor(reason: string) {
    super("banner.invalid_target", 400, `invalid banner targeting: ${reason}`);
    this.name = "BannerInvalidTarget";
  }
}

export class BannerMulticastTooLarge extends ModuleError {
  constructor(size: number, max: number) {
    super(
      "banner.multicast_too_large",
      400,
      `banner multicast target list length ${size} exceeds max ${max}`,
    );
    this.name = "BannerMulticastTooLarge";
  }
}

export class BannerInvalidVisibilityWindow extends ModuleError {
  constructor(reason: string) {
    super("banner.invalid_visibility_window", 400, reason);
    this.name = "BannerInvalidVisibilityWindow";
  }
}

export class BannerReorderMismatch extends ModuleError {
  constructor(reason: string) {
    super("banner.reorder_mismatch", 400, reason);
    this.name = "BannerReorderMismatch";
  }
}
