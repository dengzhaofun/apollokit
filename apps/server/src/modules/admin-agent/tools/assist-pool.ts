import { tool } from "ai";

import { CreateConfigSchema } from "../../assist-pool/validators";

export const applyAssistPoolConfig = tool({
  description:
    "Propose a complete assist-pool configuration to apply to the form. " +
    "The user reviews before saving. Call this after gathering enough " +
    "info for required fields.",
  inputSchema: CreateConfigSchema,
});
