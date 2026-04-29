import { tool } from "ai";
import { z } from "zod";

import { UpdateConfigSchema } from "../../../check-in/validators";

/**
 * Module tool: propose a partial update to an existing check-in config.
 *
 * Distinct from `applyCheckInConfig` (which takes a *complete* config for
 * the create form). `patch*` is the right tool when the user @-mentions
 * an existing resource and asks for a tweak — closing it, renaming,
 * changing the target, etc.
 *
 * Client-side tool — no `execute`. The model emits `{ key, patch }`,
 * the frontend renders a confirmation card showing the diff, and the
 * user clicks "确认" to fire `PATCH /api/check-in/configs/{key}` with
 * the patch body. The server's update endpoint already does the right
 * partial-merge.
 *
 * `key` matches what the mention pipeline produces (UUID id for most
 * modules; alias for announcement). The check-in PATCH route accepts
 * UUID id only at the moment, but mention always sends UUID for
 * check-in so this is safe.
 */
export const patchCheckInConfig = tool({
  description:
    "Apply a PARTIAL update to an existing check-in config that the user @-mentioned. " +
    "Use this when the user wants to MODIFY an existing config (e.g. close, rename, " +
    "change target). DO NOT use applyCheckInConfig for modifications — that tool is for " +
    "creating new configs and would overwrite all fields. Only include the fields the " +
    "user explicitly asked to change.",
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        "Identifier of the existing config — id (UUID) or alias. Take this from the " +
          "@-mentioned resource's id field in the system context.",
      ),
    patch: UpdateConfigSchema.describe(
      "Partial — ONLY the fields the user wants to change. Leave every other field out.",
    ),
  }),
});
