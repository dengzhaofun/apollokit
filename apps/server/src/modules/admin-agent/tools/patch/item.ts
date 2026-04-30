import { tool } from "ai";
import { z } from "zod";

import { UpdateDefinitionSchema } from "../../../item/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing item definition.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * `itemService.updateCategory(orgId, id, patch)` accepts UUID or alias.
 */
const description =
  "Apply a PARTIAL update to an existing item definition that the user @-mentioned. " +
  "Use this for modifications (rename, change stack limit, deactivate, etc.) — " +
  "only include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z
    .string()
    .describe("Identifier of the existing item — id (UUID) or alias."),
  patch: UpdateDefinitionSchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchItemDefinitionPropose = tool({ description, inputSchema });

export const patchItemDefinitionExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.item.updateCategory(
      execCtx.organizationId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("item", updated),
    };
  },
});
