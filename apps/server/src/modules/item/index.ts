/**
 * Item module barrel.
 *
 * Glues the AppDeps singleton to the service factory and re-exports
 * the singleton for routes and other modules to consume.
 */

import { deps } from "../../deps";
import { createItemService } from "./service";

export { createItemService };
export type { ItemService } from "./service";
export const itemService = createItemService(deps);
export { itemRouter } from "./routes";
export { itemClientRouter } from "./client-routes";
