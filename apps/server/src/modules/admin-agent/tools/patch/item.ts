import { tool } from "ai";
import { z } from "zod";

import { UpdateDefinitionSchema } from "../../../item/validators";

/**
 * Module tool: partial update to an existing item definition.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 */
export const patchItemDefinition = tool({
  description:
    "Apply a PARTIAL update to an existing item definition that the user @-mentioned. " +
    "Use this for modifications (rename, change stack limit, deactivate, etc.) — " +
    "only include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Identifier of the existing item — id (UUID) or alias."),
    patch: UpdateDefinitionSchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
