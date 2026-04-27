import { tool } from "ai";
import { z } from "zod";

import { ADMIN_MODULES } from "../types";

/**
 * Cross-module tool: ask the user a single targeted clarification.
 *
 * The model emits this when the user's request is missing key info.
 * The frontend renders the question + optional quick-reply chips; the
 * user's answer is sent back as the next chat message and the agent
 * proceeds.
 *
 * No `execute` — this is a client-side tool. The model just emits the
 * input and stops; the UI handles the rest.
 */
export const askClarification = tool({
  description:
    "Ask the user one targeted question when key info is missing. " +
    "Use this BEFORE proposing a config when the user's request is vague. " +
    "Ask only ONE question per call — pick the most blocking field.",
  inputSchema: z.object({
    field: z
      .string()
      .describe(
        "Which form field or concept this question is about (e.g. 'resetMode', 'target', 'name').",
      ),
    question: z
      .string()
      .describe("The question text shown to the user."),
    suggestions: z
      .array(z.string())
      .max(4)
      .optional()
      .describe(
        "Up to 4 quick-reply chips. Clicking one sends the chip text back as the user's answer.",
      ),
  }),
});

/**
 * Cross-module tool: ask the user to navigate to another page.
 *
 * Why a tool instead of just text: the frontend renders this as a card
 * with a one-click button that navigates via TanStack Router (no full
 * reload), and emits a `tool-result` so the agent knows whether the
 * user accepted or skipped.
 *
 * Use cases the agent should pick this for:
 *   - User on `/check-in` (list) says "I want a 7-day check-in" → suggest
 *     navigating to `check-in:create` so the apply-tool path opens up.
 *   - User asks about a specific config that exists ("show me the 'daily'
 *     config in detail") → suggest `<module>:edit` (best-effort; we
 *     don't carry the id here, the user picks).
 *
 * Client-side only — no `execute`.
 */
export const navigateTo = tool({
  description:
    "Suggest the user navigate to another admin page. Use this when " +
    "answering the user's request requires them to be on a different " +
    "page (e.g. they're on a list page and want to create a config — " +
    "suggest navigating to the create modal). The frontend renders a " +
    "button the user can click to navigate. DON'T spam: only emit when " +
    "switching pages would unblock the user's stated goal.",
  inputSchema: z.object({
    module: z
      .enum(ADMIN_MODULES)
      .describe(
        "Which module's page to navigate to. Must be a known admin module.",
      ),
    intent: z
      .enum(["list", "create"])
      .describe(
        "'list' to see all configs of that module, 'create' to open the new-config form.",
      ),
    reason: z
      .string()
      .describe(
        "One-sentence reason shown to the user, e.g. '在签到的创建表单里我可以帮你回填'.",
      ),
  }),
});
