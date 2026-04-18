/**
 * Task module barrel.
 *
 * Wiring notes:
 *
 * - The service needs `rewardServices` (for manual claim grantRewards)
 *   and `mailService` (for autoClaim mail dispatch).
 *
 * - Unlike collection, the task module does NOT hook into itemService.
 *   Business events are delivered via the HTTP `/events` endpoint.
 *   This keeps the module decoupled.
 */

import { deps } from "../../deps";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { mailService } from "../mail";
import { createTaskService } from "./service";

export { createTaskService };
export type { TaskService } from "./service";

export const taskService = createTaskService(
  deps,
  { itemSvc: itemService, currencySvc: currencyService },
  () => mailService,
);

export { taskRouter } from "./routes";
export { taskClientRouter } from "./client-routes";
