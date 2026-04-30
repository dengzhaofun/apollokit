import { tool } from "ai";
import { z } from "zod";

import { UpdateActivitySchema } from "../../../activity/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing activity.
 * See `patch/check-in.ts` for the propose-vs-execute rationale.
 *
 * `activityService.updateActivity(orgId, idOrAlias, patch)` accepts both
 * UUID id and alias.
 */
const description =
  "Apply a PARTIAL update to an existing activity that the user @-mentioned. " +
  "Use this for modifications (rename, change schedule, status transitions, etc.) — " +
  "only include the fields the user explicitly asked to change.";

const inputSchema = z.object({
  key: z
    .string()
    .describe("Identifier of the existing activity — id (UUID) or alias."),
  patch: UpdateActivitySchema.describe(
    "Partial — ONLY the fields the user wants to change.",
  ),
});

export const patchActivityConfigPropose = tool({ description, inputSchema });

export const patchActivityConfigExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.activity.updateActivity(
      execCtx.organizationId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("activity", updated),
    };
  },
});
