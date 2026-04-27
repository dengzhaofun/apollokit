import { tool } from "ai";

import { CreateBatchSchema } from "../../cdkey/validators";

export const applyCdkeyBatch = tool({
  description:
    "Propose a complete CD-key batch configuration to apply to the form. " +
    "The user reviews before saving. The actual key generation happens " +
    "on the server after the form is submitted.",
  inputSchema: CreateBatchSchema,
});
