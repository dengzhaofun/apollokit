import { tool } from "ai";
import { z } from "zod";

import { UpdateCharacterSchema } from "../../../character/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing character.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * `characterService.updateCharacter(orgId, id, patch)` requires UUID id;
 * the mention descriptor for character always supplies UUID.
 */
const description =
  "Apply a PARTIAL update to an existing character that the user @-mentioned. " +
  "Use this for modifications (rename, swap portrait, deactivate, etc.) — " +
  "only include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z.string().describe("Identifier of the existing character — id (UUID)."),
  patch: UpdateCharacterSchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchCharacterConfigPropose = tool({ description, inputSchema });

export const patchCharacterConfigExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.character.updateCharacter(
      execCtx.tenantId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("character", updated),
    };
  },
});
