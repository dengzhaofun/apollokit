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
import { registerEvent } from "../../lib/event-registry";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { mailService } from "../mail";
import { createTaskService } from "./service";

// 自己发的事件不要桥接回自己，避免自反循环 —— 全部 forwardToTask: false。
registerEvent({
  name: "task.completed",
  owner: "task",
  description:
    "Fired when a user's progress on a task first reaches its targetValue.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "completedAt", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "task.claimed",
  owner: "task",
  description:
    "Fired when a user manually claims a completed task's rewards.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "categoryId", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "rewards", type: "array", required: true },
    { path: "periodKey", type: "string", required: true },
    { path: "claimedAt", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "task.tier.claimed",
  owner: "task",
  description:
    "Fired when a user claims a staged-reward tier (阶段性奖励) of a task.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "tierAlias", type: "string", required: true },
    { path: "threshold", type: "number", required: true },
    { path: "progressValue", type: "number", required: true },
    { path: "rewards", type: "array", required: true },
    { path: "periodKey", type: "string", required: true },
    { path: "claimedAt", type: "string", required: true },
  ],
  forwardToTask: false,
});

export { createTaskService };
export type { TaskService } from "./service";

export const taskService = createTaskService(
  deps,
  { itemSvc: itemService, currencySvc: currencyService },
  () => mailService,
);

export { taskRouter } from "./routes";
export { taskClientRouter } from "./client-routes";
