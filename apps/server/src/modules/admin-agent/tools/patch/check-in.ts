import { tool } from "ai";
import { z } from "zod";

import { UpdateConfigSchema } from "../../../check-in/validators";
import type { AgentToolContext } from "../../agents/types";
import { serializeForAgent } from "./serialize";

/**
 * Module tool: partial update to an existing check-in config.
 *
 * Distinct from `applyCheckInConfig` (which takes a *complete* config for
 * the create form). `patch*` is the right tool when the user @-mentions
 * an existing resource and asks for a tweak — closing it, renaming,
 * changing the target, etc.
 *
 * Two variants share `description` + `inputSchema`:
 *
 *   - `patchCheckInConfigPropose` — no `execute`. Used by the **form-fill**
 *     agent. Frontend renders `PatchConfigCard`, user clicks "确认", FE
 *     fires `PATCH /api/check-in/configs/{key}`.
 *   - `patchCheckInConfigExecute` — has `execute` that calls
 *     `checkInService.updateConfig` directly. Used by the **global-assistant**
 *     agent. The user expects "execute, don't ask".
 *
 * The `execute` variant reads per-request data via AI SDK v6's
 * `experimental_context` (set in `service.streamChat` via
 * `createAgentUIStreamResponse({ options })`), so the tool definition is
 * stateless and module-level singleton-friendly.
 *
 * `key` matches what the mention pipeline produces (UUID id for check-in;
 * `loadConfigByKey` accepts both UUID and alias internally).
 */
const description =
  "Apply a PARTIAL update to an existing check-in config that the user @-mentioned. " +
  "Use this when the user wants to MODIFY an existing config (e.g. close, rename, " +
  "change target). DO NOT use applyCheckInConfig for modifications — that tool is for " +
  "creating new configs and would overwrite all fields. Only include the fields the " +
  "user explicitly asked to change.";

const inputSchema = z.object({
  key: z
    .string()
    .describe(
      "Identifier of the existing config — id (UUID) or alias. Take this from the " +
        "@-mentioned resource's id field in the system context.",
    ),
  patch: UpdateConfigSchema.describe(
    "Partial — ONLY the fields the user wants to change. Leave every other field out.",
  ),
});

export const patchCheckInConfigPropose = tool({ description, inputSchema });

export const patchCheckInConfigExecute = tool({
  description,
  inputSchema,
  execute: async ({ key, patch }, { experimental_context }) => {
    const { execCtx, deps } = experimental_context as AgentToolContext;
    const updated = await deps.checkIn.updateConfig(
      execCtx.organizationId,
      key,
      patch,
    );
    return {
      applied: true,
      key,
      summary: serializeForAgent("check-in", updated),
    };
  },
});
