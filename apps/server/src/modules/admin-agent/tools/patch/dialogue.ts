import { tool } from "ai";
import { z } from "zod";

import { UpdateDialogueScriptSchema } from "../../../dialogue/validators";

/**
 * Module tool: partial update to an existing dialogue script.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 */
export const patchDialogueScript = tool({
  description:
    "Apply a PARTIAL update to an existing dialogue script that the user @-mentioned. " +
    "Use this for modifications (rename, edit metadata, deactivate, etc.) — " +
    "only include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Identifier of the existing script — id (UUID)."),
    patch: UpdateDialogueScriptSchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
