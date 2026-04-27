/**
 * Admin agent module barrel.
 *
 * Single per-isolate singleton wired with the global `deps`. Tests can
 * import `createAdminAgentService` directly and pass a mock `ai` provider.
 *
 * See `routes.ts` for why this router does NOT use `OpenAPIHono` /
 * the standard envelope.
 */

import { deps } from "../../deps";
import { createAdminAgentService } from "./service";

export { createAdminAgentService };
export type { AdminAgentService } from "./service";
export const adminAgentService = createAdminAgentService(deps);
export { adminAgentRouter } from "./routes";
export {
  ADMIN_MODULES,
  isAdminSurface,
  type AdminModule,
  type AdminSurface,
} from "./types";
