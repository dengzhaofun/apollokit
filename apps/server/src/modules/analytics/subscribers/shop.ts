import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerShopSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("shop.purchased", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "shop.purchased",
      source: "shop",
      // One transaction = amount 1. "Monetary" totals aren't available
      // on shop (costs are items, not currency); cost/reward detail lives
      // in eventData for downstream funnel analysis.
      amount: 1,
      eventData: {
        purchaseId: p.purchaseId,
        productId: p.productId,
        productAlias: p.productAlias,
        productType: p.productType,
        costItems: p.costItems,
        rewardItems: p.rewardItems,
      },
    });
  });

  events.on("shop.stage_claimed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "shop.stage_claimed",
      source: "shop",
      amount: 1,
      eventData: {
        claimId: p.claimId,
        stageId: p.stageId,
        productId: p.productId,
        stageIndex: p.stageIndex,
        rewardItems: p.rewardItems,
      },
    });
  });
}
