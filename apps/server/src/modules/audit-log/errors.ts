import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class AuditLogNotFound extends ModuleError {
  constructor(id: string) {
    super("audit_log.not_found", 404, `audit log not found: ${id}`);
    this.name = "AuditLogNotFound";
  }
}
