/**
 * Shop module barrel.
 *
 * Shop depends on the item service for grant/deduct operations
 * (purchases pay in items, regular products grant items, growth-pack
 * stage claims grant items). The cross-module wiring happens here at the
 * glue point — neither `service.ts` nor `routes.ts` imports
 * `../item/index` directly. See `modules/exchange/index.ts` for prior
 * art.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createShopService } from "./service";

export { createShopService };
export type { ShopService } from "./service";
export const shopService = createShopService(deps, itemService);
export { shopRouter } from "./routes";
export { shopClientRouter } from "./client-routes";
