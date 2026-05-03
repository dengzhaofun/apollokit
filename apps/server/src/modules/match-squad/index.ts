/**
 * MatchSquad module barrel.
 *
 * Glues the `AppDeps` singleton and the service factory together.
 * Production code (routes, future cron jobs) imports the pre-built
 * `matchSquadService` singleton from here; tests and alternative wiring can
 * import `createMatchSquadService` directly and pass their own mocked deps.
 */

import { deps } from "../../deps";
import { createMatchSquadService } from "./service";

export { createMatchSquadService };
export type { TeamService } from "./service";
export const matchSquadService = createMatchSquadService(deps);
export { matchSquadRouter } from "./routes";
export { matchSquadClientRouter } from "./client-routes";
