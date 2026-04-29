import { tool } from "ai";
import { z } from "zod";

import { UpdateDefinitionSchema } from "../../../task/validators";

/**
 * Module tool: partial update to an existing task definition.
 * See `patch/check-in.ts` for the rationale on patch vs apply.
 */
export const patchTaskDefinition = tool({
  description:
    "Apply a PARTIAL update to an existing task definition that the user @-mentioned. " +
    "Use this for modifications (close, rename, change targetValue, etc.) — only " +
    "include the fields the user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Identifier of the existing task — id (UUID) or alias."),
    patch: UpdateDefinitionSchema.describe(
      "Partial — ONLY the fields the user wants to change.",
    ),
  }),
});
