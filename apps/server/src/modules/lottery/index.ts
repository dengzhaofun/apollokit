/**
 * Lottery module barrel.
 *
 * The lottery service depends on the item service for grant/deduct
 * operations. This is injected here at the glue point.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createLotteryService } from "./service";

export { createLotteryService };
export type { LotteryService } from "./service";
export const lotteryService = createLotteryService(deps, itemService);
export { lotteryRouter } from "./routes";
export { lotteryClientRouter } from "./client-routes";
