/**
 * Exchange module barrel.
 *
 * The exchange service depends on the item service AND the currency
 * service — cost/reward entries are dispatched per-type (`item` vs
 * `currency`) so we need both. Injection happens at this glue point.
 */

import { deps } from "../../deps";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { createExchangeService } from "./service";

export { createExchangeService };
export type { ExchangeService } from "./service";
export const exchangeService = createExchangeService(
  deps,
  itemService,
  currencyService,
);
export { exchangeRouter } from "./routes";
export { exchangeClientRouter } from "./client-routes";
