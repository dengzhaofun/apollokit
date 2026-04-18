/**
 * Media library module barrel.
 *
 * The service instance pulls an `ObjectStorage` off `deps.storage`,
 * which is constructed in `src/deps.ts` from env vars (R2 binding by
 * default, S3 via SigV4 as a fallback / migration target).
 */

import { deps } from "../../deps";
import { createMediaLibraryService } from "./service";

export { createMediaLibraryService };
export type { MediaLibraryService } from "./service";
export const mediaLibraryService = createMediaLibraryService({
  db: deps.db,
  storage: deps.storage,
});
export { mediaLibraryRouter } from "./routes";
