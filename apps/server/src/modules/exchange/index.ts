/**
 * Exchange module barrel.
 *
 * The exchange service depends on the item service for grant/deduct
 * operations. This is injected here at the glue point.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createExchangeService } from "./service";

export { createExchangeService };
export type { ExchangeService } from "./service";
export const exchangeService = createExchangeService(deps, itemService);
export { exchangeRouter } from "./routes";
export { exchangeClientRouter } from "./client-routes";
