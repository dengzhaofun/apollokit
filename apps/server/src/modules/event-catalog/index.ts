import { deps } from "../../deps";

import { createEventCatalogService } from "./service";

export { createEventCatalogService };
export type { EventCatalogService } from "./service";

export const eventCatalogService = createEventCatalogService(deps);

// router is wired in Phase 6 — see ./routes.ts
