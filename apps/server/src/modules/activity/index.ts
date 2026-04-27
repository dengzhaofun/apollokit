/**
 * Activity module barrel.
 *
 * The service depends on the shared `deps` and a lazy getter for
 * `mailService` (for milestone reward dispatch + broadcast_mail
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
    "Activity 生命周期跃迁 (draft → active → ended)。系统级事件，不带 endUserId，因此不桥接到 task。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "previousState", type: "string", required: true },
    { path: "newState", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "activity.schedule.fired",
  owner: "activity",
  description:
    "Activity-scoped schedule 到达触发时间。系统级事件，不桥接到 task。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "scheduleAlias", type: "string", required: true },
    { path: "actionType", type: "string", required: true },
    { path: "firedAt", type: "string", required: true },
    { path: "actionConfig", type: "object", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "activity.milestone.claimed",
  owner: "activity",
  description: "A user claimed an activity milestone reward.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "milestoneAlias", type: "string", required: true },
  ],
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
