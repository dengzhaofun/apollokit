/**
 * Entity module barrel.
 *
 * Phase 1 wiring: only admin CRUD for schemas, blueprints, skins,
 * and formation configs. No cross-module hooks yet.
 *
 * Phase 2+ will add itemService dependency for material consumption
 * during level-up, rank-up, and synthesis operations.
 */

import { deps } from "../../deps";
import { createEntityService } from "./service";

export { createEntityService };
export type { EntityService } from "./service";

export const entityService = createEntityService(deps);

export { entityRouter } from "./routes";
export { entityClientRouter } from "./client-routes";
