/**
 * Currency module barrel.
 *
 * Wires the shared AppDeps singleton to the service factory and
 * re-exports both the factory (for tests / alt wiring) and the
 * per-isolate singleton (for routes and other modules).
 */

import { deps } from "../../deps";
import { createCurrencyService } from "./service";

export { createCurrencyService };
export type { CurrencyService } from "./service";
export const currencyService = createCurrencyService(deps);
export { currencyRouter } from "./routes";
export { currencyClientRouter } from "./client-routes";
