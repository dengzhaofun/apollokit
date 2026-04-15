/**
 * Collection module barrel.
 *
 * Wiring notes:
 *
 * - The service needs `itemService` (for manual-claim grantItems) and
 *   `mailService` (for autoClaim mail dispatch). Neither of those
 *   modules imports `collection`, so there is no import cycle — we can
 *   pull them statically at module-init time.
 *
 * - `itemService` must call BACK into `collectionService.onItemGranted`
 *   inside its grantItems hook. We register that hook here, AFTER the
 *   collection service has been constructed.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { mailService } from "../mail";
import { createCollectionService } from "./service";

export { createCollectionService };
export type { CollectionService } from "./service";

export const collectionService = createCollectionService(
  deps,
  itemService,
  () => mailService,
);

// Register the unlock hook on itemService. `setGrantHook` is defined by
// item/service.ts and stored as a module-scope mutable ref.
itemService.setGrantHook(async (params) => {
  await collectionService.onItemGranted(params);
});

export { collectionRouter } from "./routes";
export { collectionClientRouter } from "./client-routes";
