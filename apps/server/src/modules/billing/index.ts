/**
 * Billing module barrel — service singleton + router export.
 */

import { deps } from "../../deps";
import { createBillingService } from "./service";

export { createBillingService };
export type { BillingService } from "./service";
export const billingService = createBillingService(deps);
export { billingRouter } from "./routes";
