/**
 * Banner module barrel.
 *
 * No cross-module service injection needed — banner is self-contained.
 */

import { deps } from "../../deps";
import { createBannerService } from "./service";

export { createBannerService };
export type { BannerService } from "./service";
export const bannerService = createBannerService(deps);
export { bannerRouter } from "./routes";
export { bannerClientRouter } from "./client-routes";
