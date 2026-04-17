/**
 * Activity module barrel.
 *
 * The service depends on the shared `deps` and a lazy getter for
 * `mailService` (for milestone reward dispatch + broadcast_mail
 * schedule actions). Mail is imported via function to avoid module
 * load-order coupling — the barrel is always loaded AFTER mail's.
 */

import { deps } from "../../deps";
import { mailService } from "../mail";
import { createActivityService } from "./service";

export { createActivityService };
export type { ActivityService } from "./service";

export const activityService = createActivityService(deps, () => mailService);

export { activityRouter } from "./routes";
export { activityClientRouter } from "./client-routes";
