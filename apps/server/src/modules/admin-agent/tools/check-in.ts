import { tool } from "ai";

import { CreateConfigSchema } from "../../check-in/validators";

/**
 * Module tool: propose a check-in config to apply to the create/edit form.
 *
 * The schema is the **same** zod schema the HTTP endpoint validates against
 * (`CreateConfigSchema` from `modules/check-in/validators.ts`), so a tool
 * input that passes here will pass the actual create endpoint too. The
 * `.superRefine` cross-field rule (target ↔ resetMode) gates bad inputs
 * server-side; we also describe the constraint in the system prompt so the
 * model knows up front.
 *
 * Client-side tool — no `execute`. The model emits the structured input,
 * the frontend shows it in a confirmation card, and the user clicks
 * "Apply" to write it into the TanStack Form. The server NEVER persists
 * the config from here; persistence still goes through `POST /api/check-in/configs`.
 */
export const applyCheckInConfig = tool({
  description:
    "Propose a complete check-in configuration to apply to the form. " +
    "The user will REVIEW the proposal before saving — you are not " +
    "actually creating anything in the database. " +
    "Call this ONLY after gathering enough info for all required fields " +
    "(name, resetMode). Always include sensible defaults (timezone, " +
    "weekStartsOn, isActive=true) unless the user specified otherwise.",
  inputSchema: CreateConfigSchema,
});
