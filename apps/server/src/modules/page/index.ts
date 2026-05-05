/**
 * Page module barrel.
 *
 * Glues the `AppDeps` singleton to the service factory. Routes import the
 * pre-built `pageService` singleton from here; tests and alternative wiring
 * import `createPageService` directly and pass mock deps.
 *
 * The five `page.*` events are registered in the runtime event-bus type map
 * by the `declare module` block in `service.ts` (loaded transitively when
 * this barrel is imported).
 */

import { deps } from "../../deps";
import { createPageService } from "./service";

export { createPageService };
export type { PageService } from "./service";
export const pageService = createPageService(deps);
export { pageRouter } from "./routes";
export { pageClientRouter } from "./client-routes";
export {
  PageBoundModuleViolation,
  PageInvalidSchema,
  PagePreviewTokenInvalid,
  PageProjectNotFound,
  PageProjectSlugConflict,
  PageProjectSlugReserved,
  PageTemplateNotFound,
  PageVersionMismatch,
  PageVersionNotFound,
} from "./errors";
export {
  signPreviewToken,
  verifyPreviewToken,
} from "./preview-token";
export type {
  PageAuthMode,
  PageConversationRole,
  PageProject,
  PageProjectConversation,
  PageProjectSchema,
  PageProjectStatus,
  PageProjectVersion,
  PageTemplate,
  PageTemplateCategory,
  PageVersionAuthorType,
  PreviewTokenPayload,
} from "./types";
