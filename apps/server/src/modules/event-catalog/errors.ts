/**
 * Typed errors for the event-catalog module.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class EventCatalogNotFound extends ModuleError {
  constructor(name: string) {
    super(
      "event_catalog.not_found",
      404,
      `event catalog entry not found: ${name}`,
    );
    this.name = "EventCatalogNotFound";
  }
}

export class EventCatalogReadOnly extends ModuleError {
  constructor(reason: string) {
    super(
      "event_catalog.read_only",
      400,
      `event catalog entry is read-only: ${reason}`,
    );
    this.name = "EventCatalogReadOnly";
  }
}
