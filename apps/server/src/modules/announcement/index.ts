/**
 * Announcement module barrel.
 *
 * No cross-module service injection needed — announcement is self-contained.
 * The five announcement.* events are registered in the runtime event
 * registry here (at import time) so the Event Catalog admin page can list
 * them. `forwardToTask: false` because these are operator-authored
 * broadcasts, not player behavior signals — task progress should not key
 * off them.
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { createAnnouncementService } from "./service";

registerEvent({
  name: "announcement.created",
  owner: "announcement",
  description: "Fired when an admin publishes a new announcement.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "announcementId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "kind", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "announcement.updated",
  owner: "announcement",
  description: "Fired when an announcement is edited.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "announcementId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "announcement.deleted",
  owner: "announcement",
  description: "Fired when an announcement is deleted.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "announcementId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "announcement.impression",
  owner: "announcement",
  description:
    "Fired when the game client reports that an end user saw an announcement.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "announcementId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "kind", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "announcement.click",
  owner: "announcement",
  description:
    "Fired when the game client reports that an end user clicked an announcement's CTA.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "announcementId", type: "string", required: true },
    { path: "alias", type: "string", required: true },
    { path: "ctaUrl", type: "string", required: false },
  ],
  forwardToTask: false,
});

export { createAnnouncementService };
export type { AnnouncementService } from "./service";
export const announcementService = createAnnouncementService(deps);
export { announcementRouter } from "./routes";
export { announcementClientRouter } from "./client-routes";
