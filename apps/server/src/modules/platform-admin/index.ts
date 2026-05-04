/**
 * Platform-admin module barrel — service singleton + router export.
 */

import { deps } from "../../deps";
import { createPlatformAdminService } from "./service";

export { createPlatformAdminService };
export type { PlatformAdminService } from "./service";
export const platformAdminService = createPlatformAdminService(deps);
export { platformAdminRouter } from "./routes";
