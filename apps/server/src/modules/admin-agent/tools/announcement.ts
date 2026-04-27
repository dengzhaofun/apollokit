import { tool } from "ai";

import { CreateAnnouncementSchema } from "../../announcement/validators";

export const applyAnnouncementConfig = tool({
  description:
    "Propose a complete announcement to apply to the form. The user " +
    "reviews before saving — you are not creating it directly. Call " +
    "this only after gathering enough info for required fields.",
  inputSchema: CreateAnnouncementSchema,
});
