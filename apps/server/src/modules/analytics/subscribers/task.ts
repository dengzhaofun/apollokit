import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerTaskSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("task.completed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "task.completed",
      source: "task",
      amount: 1,
      eventData: {
        taskId: p.taskId,
        taskAlias: p.taskAlias,
        progressValue: p.progressValue,
        completedAt: p.completedAt,
      },
    });
  });

  events.on("task.claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "task.claimed",
      source: "task",
      amount: 1,
      eventData: {
        taskId: p.taskId,
        taskAlias: p.taskAlias,
        categoryId: p.categoryId,
        progressValue: p.progressValue,
        rewards: p.rewards,
        periodKey: p.periodKey,
        claimedAt: p.claimedAt,
      },
    });
  });

  events.on("task.tier.claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "task.tier.claimed",
      source: "task",
      amount: 1,
      eventData: {
        taskId: p.taskId,
        taskAlias: p.taskAlias,
        tierAlias: p.tierAlias,
        threshold: p.threshold,
        progressValue: p.progressValue,
        rewards: p.rewards,
        periodKey: p.periodKey,
        claimedAt: p.claimedAt,
      },
    });
  });
}
