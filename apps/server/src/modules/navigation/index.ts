/**
 * Navigation module barrel.
 *
 * Wires the shared AppDeps singleton to the service factory and
 * re-exports both the factory (for tests / alt wiring) and the
 * per-isolate singleton (for routes).
 */

import { deps } from "../../deps"
import { createNavigationService } from "./service"

export { createNavigationService }
export type { NavigationService } from "./service"
export const navigationService = createNavigationService(deps)
export { navigationRouter } from "./routes"
