/**
 * Level module barrel.
 *
 * Wiring notes:
 *
 * - The service needs `rewardServices` (itemService + entityService) for
 *   granting clear rewards and star rewards via the unified reward system.
 *
 * - Unlike collection, the level module has no cross-module hooks — it
 *   doesn't need to register callbacks on other services. Levels are
 *   cleared by explicit client API calls, not by side-effects from
 *   other modules.
 */

import { deps } from "../../deps";
import { currencyService } from "../currency";
import { entityService } from "../entity";
import { itemService } from "../item";
import { createLevelService } from "./service";

export { createLevelService };
export type { LevelService } from "./service";

export const levelService = createLevelService(deps, {
  itemSvc: itemService,
  currencySvc: currencyService,
  entitySvc: entityService,
});

export { levelRouter } from "./routes";
export { levelClientRouter } from "./client-routes";
