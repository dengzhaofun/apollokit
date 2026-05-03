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
import { installTaskEventForwarder } from "./event-forwarder";
import { createTaskService } from "./service";

// 自己发的事件不要桥接回自己，避免自反循环 —— 不带 task-trigger capability。
// 但作为高价值业务信号，显式 opt-in webhook + trigger-rule，让租户能订阅外发
// 或在 admin 里配置 in-platform trigger 规则（"任务完成 → 解锁地图 / 发邮件"）。
registerEvent({
  name: "task.completed",
  owner: "task",
  description:
    "Fired when a user's progress on a task first reaches its targetValue.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "completedAt", type: "string", required: true },
  ],
  capabilities: ["analytics", "webhook", "trigger-rule"],
});

registerEvent({
  name: "task.claimed",
  owner: "task",
  description:
    "Fired when a user manually claims a completed task's rewards.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "categoryId", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "rewards", type: "array", required: true },
    { path: "periodKey", type: "string", required: true },
    { path: "claimedAt", type: "string", required: true },
  ],
  capabilities: ["analytics", "webhook", "trigger-rule"],
});

registerEvent({
  name: "task.tier.claimed",
  owner: "task",
  description:
    "Fired when a user claims a staged-reward tier (阶段性奖励) of a task.",
  fields: [
    { path: "tenantId", type: "string", required: true },
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
  capabilities: ["analytics", "webhook", "trigger-rule"],
});

export { createTaskService };
export type { TaskService } from "./service";

export const taskService = createTaskService(
  deps,
  { itemSvc: itemService, currencySvc: currencyService },
  () => mailService,
);

// 桥接：订阅 registry 里标 forwardToTask=true 的内部事件，自动调用
// processEvent。依赖 level / leaderboard / activity 等 module 的
// registerEvent 先于本 barrel 执行 —— import 顺序由 src/index.ts 保证
// （它们比 task 更早被 import）。
installTaskEventForwarder(deps.events, taskService);

export { taskRouter } from "./routes";
export { taskClientRouter } from "./client-routes";
