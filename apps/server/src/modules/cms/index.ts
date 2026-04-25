/**
 * CMS module barrel.
 *
 * Glues the `AppDeps` singleton to the service factory. Production code
 * (routes, future jobs) imports the pre-built `cmsService`; tests import
 * `createCmsService` and pass mock deps.
 */

import { deps } from "../../deps";
import { createCmsService } from "./service";

export { createCmsService };
export type { CmsService } from "./service";
export const cmsService = createCmsService(deps);
export { cmsRouter } from "./routes";
export { cmsClientRouter } from "./client-routes";
