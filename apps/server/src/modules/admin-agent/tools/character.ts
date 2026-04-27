import { tool } from "ai";

import { CreateCharacterSchema } from "../../character/validators";

export const applyCharacterConfig = tool({
  description:
    "Propose a complete character configuration to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateCharacterSchema,
});
