/**
 * Audit-log module barrel.
 *
 * Service is read-only; no mutation factory exposed. Production code
 * imports `auditLogService` from here. Tests can import `createAuditLogService`
 * directly.
 */

import { deps } from "../../deps";
import { createAuditLogService } from "./service";

export { createAuditLogService };
export type { AuditLogService } from "./service";
export const auditLogService = createAuditLogService(deps);
export { auditLogRouter } from "./routes";
