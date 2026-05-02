/**
 * Experiment module barrel.
 *
 * Glues:
 *   - `deps` (db + events) from the AppDeps singleton.
 *
 * Exposure event (`experiment.exposure`) is emitted by the service via
 * `deps.events`; the central event-bus → analytics writer subscriber
 * forwards every emit to Tinybird's `events` datasource. No per-module
 * Tinybird writer required.
 */

import { deps } from "../../deps";
import { createExperimentService } from "./service";

export { createExperimentService };
export type { ExperimentService } from "./service";

export const experimentService = createExperimentService(deps);

export { experimentRouter } from "./routes";
export { experimentClientRouter } from "./client-routes";
