/**
 * Entity module barrel.
 *
 * Wiring: entity depends on item (for material deduction during
 * level-up, rank-up, synthesis). The dependency is one-way — item
 * does not import entity.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createEntityService } from "./service";

export { createEntityService };
export type { EntityService } from "./service";

export const entityService = createEntityService(deps, itemService);

export { entityRouter } from "./routes";
export { entityClientRouter } from "./client-routes";
