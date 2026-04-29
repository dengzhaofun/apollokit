import { tool } from "ai";
import { z } from "zod";

import { UpdateCharacterSchema } from "../../../character/validators";

/**
 * Module tool: partial update to an existing character.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 */
export const patchCharacterConfig = tool({
  description:
    "Apply a PARTIAL update to an existing character that the user @-mentioned. " +
    "Use this for modifications (rename, swap portrait, deactivate, etc.) — " +
    "only include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Identifier of the existing character — id (UUID)."),
    patch: UpdateCharacterSchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
