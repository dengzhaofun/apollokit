/**
 * Team module barrel.
 *
 * Glues the `AppDeps` singleton and the service factory together.
 * Production code (routes, future cron jobs) imports the pre-built
 * `teamService` singleton from here; tests and alternative wiring can
 * import `createTeamService` directly and pass their own mocked deps.
 */

import { deps } from "../../deps";
import { createTeamService } from "./service";

export { createTeamService };
export type { TeamService } from "./service";
export const teamService = createTeamService(deps);
export { teamRouter } from "./routes";
export { teamClientRouter } from "./client-routes";
