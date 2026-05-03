import { tool } from "ai";
import { z } from "zod";

import { UpdateDialogueScriptSchema } from "../../../dialogue/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing dialogue script.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * `dialogueService.updateScript(orgId, id, patch)` requires UUID id;
 * mention descriptor for dialogue always supplies UUID.
 */
const description =
  "Apply a PARTIAL update to an existing dialogue script that the user @-mentioned. " +
  "Use this for modifications (rename, edit metadata, deactivate, etc.) — " +
  "only include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z.string().describe("Identifier of the existing script — id (UUID)."),
  patch: UpdateDialogueScriptSchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchDialogueScriptPropose = tool({ description, inputSchema });

export const patchDialogueScriptExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.dialogue.updateScript(
      execCtx.tenantId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("dialogue", updated),
    };
  },
});
