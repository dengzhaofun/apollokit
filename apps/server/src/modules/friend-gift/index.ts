/**
 * Friend gift module barrel.
 *
 * Glues the AppDeps singleton and cross-module service dependencies
 * to the service factory. The friendService and itemService singletons
 * are injected here — service.ts only imports their types.
 */

import { deps } from "../../deps";
import { friendService } from "../friend";
import { itemService } from "../item";
import { createFriendGiftService } from "./service";

export { createFriendGiftService };
export type { FriendGiftService } from "./service";
export const friendGiftService = createFriendGiftService(
  deps,
  friendService,
  itemService,
);
export { friendGiftRouter } from "./routes";
export { friendGiftClientRouter } from "./client-routes";
