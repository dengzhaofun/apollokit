/**
 * Badge module barrel — instantiates the per-isolate singleton.
 *
 * The badge module is self-contained: it takes only `db` + `redis` from
 * `AppDeps` and imports NO other business-module code. This mirrors
 * the plan's "zero business dependencies" contract.
 */

import { deps } from "../../deps";
import { createBadgeService } from "./service";

export { createBadgeService };
export type { BadgeService } from "./service";
export const badgeService = createBadgeService(deps);
export { badgeRouter } from "./routes";
export { badgeClientRouter } from "./client-routes";
