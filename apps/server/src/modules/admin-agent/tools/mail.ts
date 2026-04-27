import { tool } from "ai";

import { CreateMailSchema } from "../../mail/validators";

export const applyMailConfig = tool({
  description:
    "Propose a complete mail (in-game system mail) to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateMailSchema,
});
