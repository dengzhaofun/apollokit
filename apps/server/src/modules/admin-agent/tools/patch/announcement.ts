import { tool } from "ai";
import { z } from "zod";

import { UpdateAnnouncementSchema } from "../../../announcement/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing announcement.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * Announcement's PATCH route accepts the alias (not UUID) — the mention
 * descriptor packs the alias into the `id` field, so this tool's `key`
 * is the alias. `announcementService.update(orgId, alias, patch)`.
 */
const description =
  "Apply a PARTIAL update to an existing announcement that the user @-mentioned. " +
  "Use this for modifications (edit title/body, change visibility window, etc.) — " +
  "only include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z
    .string()
    .describe(
      "Identifier of the existing announcement — alias (announcement uses alias as primary key in URLs).",
    ),
  patch: UpdateAnnouncementSchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchAnnouncementPropose = tool({ description, inputSchema });

export const patchAnnouncementExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.announcement.update(
      execCtx.tenantId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("announcement", updated),
    };
  },
});
