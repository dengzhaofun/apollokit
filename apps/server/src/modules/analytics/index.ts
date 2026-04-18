import { deps } from "../../deps";

import { registerAnalyticsSubscribers } from "./subscribers";

// Fire once at module load — matches the existing event-bus pattern
// (event-bus subscribers elsewhere also attach at barrel import).
registerAnalyticsSubscribers(deps.events, deps.analytics);

export { analyticsRouter } from "./routes";
export { registerAnalyticsSubscribers };
