/**
 * End-user module barrel — wiring for the `/api/end-user/*` admin routes
 * and the protocol-agnostic service factory. Keep the shape identical to
 * other modules so generic tooling (OpenAPI, tests, future event-bus
 * subscribers) can discover it uniformly.
 */

import { deps } from "../../deps";
import { createEndUserService } from "./service";

export { createEndUserService };
export type { EndUserService } from "./service";
export const endUserService = createEndUserService(deps);
export { endUserRouter } from "./routes";
