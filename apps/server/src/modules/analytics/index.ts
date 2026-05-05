import { deps } from "../../deps";

import { createAnalyticsService } from "./service";
import { registerAnalyticsSubscribers } from "./subscribers";

// Fire once at module load — matches the existing event-bus pattern
// (event-bus subscribers elsewhere also attach at barrel import).
registerAnalyticsSubscribers(deps.events, deps.analytics);

export { createAnalyticsService };
export type { AnalyticsService } from "./service";
export const analyticsService = createAnalyticsService(deps);
export { analyticsRouter } from "./routes";
export { registerAnalyticsSubscribers };
