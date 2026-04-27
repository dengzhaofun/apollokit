import { tool } from "ai";

import { CreateNodeSchema } from "../../badge/validators";

export const applyBadgeNodeConfig = tool({
  description:
    "Propose a complete badge node configuration to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateNodeSchema,
});
