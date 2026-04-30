import { tool } from "ai";
import { z } from "zod";

import { UpdateDefinitionSchema } from "../../../task/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing task definition.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * `taskService.updateDefinition(orgId, key, patch)` accepts UUID or alias.
 */
const description =
  "Apply a PARTIAL update to an existing task definition that the user @-mentioned. " +
  "Use this for modifications (close, rename, change targetValue, etc.) — only " +
  "include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z
    .string()
    .describe("Identifier of the existing task — id (UUID) or alias."),
  patch: UpdateDefinitionSchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchTaskDefinitionPropose = tool({ description, inputSchema });

export const patchTaskDefinitionExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.task.updateDefinition(
      execCtx.organizationId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("task", updated),
    };
  },
});
