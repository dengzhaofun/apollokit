/**
 * Activity module barrel.
 *
 * The service depends on the shared `deps` and a lazy getter for
 * `mailService` (for schedule grant_reward dispatch + broadcast_mail
 * schedule actions). Mail is imported via function to avoid module
 * load-order coupling — the barrel is always loaded AFTER mail's.
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { mailService } from "../mail";
import { createActivityService } from "./service";

registerEvent({
  name: "activity.state.changed",
  owner: "activity",
  description:
    "Activity 生命周期跃迁 (draft → active → ended)。系统级事件，不带 endUserId，因此不桥接到 task；外部订阅者可通过 webhook 监听。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "previousState", type: "string", required: true },
    { path: "newState", type: "string", required: true },
  ],
  capabilities: ["analytics", "webhook"],
});

registerEvent({
  name: "activity.schedule.fired",
  owner: "activity",
  description:
    "Activity-scoped schedule 到达触发时间。系统级事件，不桥接到 task；外部订阅者可通过 webhook 监听。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "scheduleAlias", type: "string", required: true },
    { path: "actionType", type: "string", required: true },
    { path: "firedAt", type: "string", required: true },
    { path: "actionConfig", type: "object", required: true },
  ],
  capabilities: ["analytics", "webhook"],
});

registerEvent({
  name: "activity.joined",
  owner: "activity",
  description:
    "用户加入活动（首次或重加）。带 endUserId，可桥接到 task / trigger-rule / webhook。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "activityAlias", type: "string", required: false },
    { path: "endUserId", type: "string", required: true },
    { path: "firstTime", type: "boolean", required: true },
  ],
  capabilities: ["task-trigger", "analytics", "webhook", "trigger-rule"],
});

registerEvent({
  name: "activity.created",
  owner: "activity",
  description:
    "管理员创建了一个新 activity（草稿态）。系统级事件，不带 endUserId。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "kind", type: "string", required: true },
    { path: "templateId", type: "string", required: false },
  ],
  capabilities: ["analytics", "webhook"],
});

registerEvent({
  name: "activity.updated",
  owner: "activity",
  description:
    "Activity 配置被更新。`changedFields` 列出实际改动的字段名，便于订阅者按 patch 决定是否处理。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "changedFields", type: "array", required: true },
  ],
  capabilities: ["analytics", "webhook"],
});

registerEvent({
  name: "activity.deleted",
  owner: "activity",
  description: "Activity 被删除（硬删，CASCADE 关联资源）。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
  ],
  capabilities: ["analytics", "webhook"],
});

registerEvent({
  name: "activity.published",
  owner: "activity",
  description:
    "管理员显式 publish（draft → 时间驱动状态机）。与 `activity.state.changed(draft→*)` 同时触发，订阅方可只听其一避免 double-fire。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "newState", type: "string", required: true },
  ],
  capabilities: ["analytics", "webhook"],
});

export { createActivityService };
export type { ActivityService } from "./service";

export const activityService = createActivityService(deps, () => mailService);

export { activityRouter } from "./routes";
export { activityClientRouter } from "./client-routes";

// Cross-module phase gate — let other modules (check-in, task, lottery,
// shop, …) guard activity-bound entry points without taking a hard
// dependency on the service factory.
export {
  assertActivityClaimable,
  assertActivityWritable,
  getActivityPhases,
  isClaimablePhase,
  isWritablePhase,
} from "./gate";
