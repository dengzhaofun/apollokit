import { ModuleError } from "../../lib/errors";

export { ModuleError } from "../../lib/errors";

export class FolderNotFound extends ModuleError {
  constructor(id: string) {
    super("media_library.folder_not_found", 404, `media folder not found: ${id}`);
    this.name = "FolderNotFound";
  }
}

export class FolderNotEmpty extends ModuleError {
  constructor(id: string) {
    super(
      "media_library.folder_not_empty",
      409,
      `media folder ${id} is not empty; move or delete contents first`,
    );
    this.name = "FolderNotEmpty";
  }
}

export class FolderNameConflict extends ModuleError {
  constructor(name: string) {
    super(
      "media_library.folder_name_conflict",
      409,
      `a folder named "${name}" already exists under this parent`,
    );
    this.name = "FolderNameConflict";
  }
}

export class CannotDeleteDefaultFolder extends ModuleError {
  constructor() {
    super(
      "media_library.cannot_delete_default_folder",
      409,
      "the default upload folder cannot be deleted",
    );
    this.name = "CannotDeleteDefaultFolder";
  }
}

export class FolderCycleDetected extends ModuleError {
  constructor() {
    super(
      "media_library.folder_cycle",
      400,
      "cannot move a folder into itself or one of its descendants",
    );
    this.name = "FolderCycleDetected";
  }
}

export class AssetNotFound extends ModuleError {
  constructor(id: string) {
    super("media_library.asset_not_found", 404, `media asset not found: ${id}`);
    this.name = "AssetNotFound";
  }
}

export class InvalidMimeType extends ModuleError {
  constructor(mime: string) {
    super(
      "media_library.invalid_mime_type",
      400,
      `mime type not allowed: ${mime}`,
    );
    this.name = "InvalidMimeType";
  }
}

export class FileTooLarge extends ModuleError {
  constructor(size: number, max: number) {
    super(
      "media_library.file_too_large",
      400,
      `file size ${size} bytes exceeds max ${max} bytes`,
    );
    this.name = "FileTooLarge";
  }
}
