/**
 * Check-in module barrel.
 *
 * This file is where the `AppDeps` singleton and the service factory are
 * glued together. Production code (routes, future cron jobs) imports the
 * pre-built `checkInService` singleton from here; tests and alternative
 * wiring can import `createCheckInService` directly and pass their own
 * mocked deps.
 *
 * Note: `service.ts` only imports the `AppDeps` *type*. It never touches
 * the `deps` constant — that indirection is what keeps the service layer
 * HTTP-agnostic and trivially testable.
 */

import { deps } from "../../deps";
import { createCheckInService } from "./service";

export { createCheckInService };
export type { CheckInService } from "./service";
export const checkInService = createCheckInService(deps);
export { checkInRouter } from "./routes";
export { checkInClientRouter } from "./client-routes";
