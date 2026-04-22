import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerActivitySubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("activity.state.changed", (p) => {
    write({
      orgId: p.organizationId,
      event: "activity.state.changed",
      source: "activity",
      eventData: {
        activityId: p.activityId,
        previousState: p.previousState,
        newState: p.newState,
      },
    });
  });

  events.on("activity.schedule.fired", (p) => {
    write({
      orgId: p.organizationId,
      event: "activity.schedule.fired",
      source: "activity",
      eventData: {
        activityId: p.activityId,
        scheduleAlias: p.scheduleAlias,
        actionType: p.actionType,
        firedAt: p.firedAt,
        actionConfig: p.actionConfig,
      },
    });
  });

  events.on("activity.milestone.claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "activity.milestone.claimed",
      source: "activity",
      amount: 1,
      eventData: {
        activityId: p.activityId,
        milestoneAlias: p.milestoneAlias,
      },
    });
  });

  events.on("activity.joined", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "activity.joined",
      source: "activity",
      // amount = 1 if this is a first-time join, 0 if it was just a
      // lastActiveAt refresh. Sum(amount) gives unique participants;
      // count(*) gives all touches.
      amount: p.firstTime ? 1 : 0,
      eventData: {
        activityId: p.activityId,
        activityAlias: p.activityAlias,
        firstTime: p.firstTime,
      },
    });
  });
}
