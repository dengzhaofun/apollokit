import { tool } from "ai";
import { z } from "zod";

import { UpdateActivitySchema } from "../../../activity/validators";

/**
 * Module tool: partial update to an existing activity.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 */
export const patchActivityConfig = tool({
  description:
    "Apply a PARTIAL update to an existing activity that the user @-mentioned. " +
    "Use this for modifications (rename, change schedule, status transitions, etc.) — " +
    "only include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Identifier of the existing activity — id (UUID) or alias."),
    patch: UpdateActivitySchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
