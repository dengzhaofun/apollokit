import { tool } from "ai";
import { z } from "zod";

import { UpdateAnnouncementSchema } from "../../../announcement/validators";

/**
 * Module tool: partial update to an existing announcement.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 *
 * Announcement's PATCH route accepts the alias (not UUID) — the mention
 * descriptor packs the alias into the `id` field, so this tool's `key`
 * is the alias.
 */
export const patchAnnouncement = tool({
  description:
    "Apply a PARTIAL update to an existing announcement that the user @-mentioned. " +
    "Use this for modifications (edit title/body, change visibility window, etc.) — " +
    "only include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        "Identifier of the existing announcement — alias (announcement uses alias as primary key in URLs).",
      ),
    patch: UpdateAnnouncementSchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
