import { ModuleError } from "../../lib/errors";

export class BillingSubscriptionNotFound extends ModuleError {
  constructor(teamId: string) {
    super(
      "billing.subscription_not_found",
      404,
      `no active subscription for team: ${teamId}`,
    );
    this.name = "BillingSubscriptionNotFound";
  }
}

export class BillingPlanNotFound extends ModuleError {
  constructor(idOrSlug: string) {
    super(
      "billing.plan_not_found",
      404,
      `subscription plan not found: ${idOrSlug}`,
    );
    this.name = "BillingPlanNotFound";
  }
}
