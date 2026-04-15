/**
 * CDKey module barrel.
 *
 * Depends on the item service for reward granting. Cross-module wiring
 * lives here, not in service.ts.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createCdkeyService } from "./service";

export { createCdkeyService };
export type { CdkeyService } from "./service";
export const cdkeyService = createCdkeyService(deps, itemService);
export { cdkeyRouter } from "./routes";
export { cdkeyClientRouter } from "./client-routes";
