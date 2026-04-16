/**
 * Guild module barrel.
 *
 * Glues the `AppDeps` singleton to the service factory. Production code
 * (routes, future cron jobs) imports the pre-built `guildService` singleton
 * from here; tests can import `createGuildService` directly and pass their
 * own mocked deps.
 */

import { deps } from "../../deps";
import { createGuildService } from "./service";

export { createGuildService };
export type { GuildService } from "./service";
export const guildService = createGuildService(deps);
export { guildRouter } from "./routes";
export { guildClientRouter } from "./client-routes";
