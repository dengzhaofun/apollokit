import { tool } from "ai";

import { CreatePoolSchema } from "../../lottery/validators";

/**
 * Lottery has nested tier/prize sub-resources, but MVP only proposes the
 * top-level pool config. Tiers and prizes are added on the pool detail
 * page after creation.
 */
export const applyLotteryConfig = tool({
  description:
    "Propose a complete lottery-pool configuration to apply to the form. " +
    "The user reviews before saving. Tiers and prizes are configured " +
    "later from the pool detail page; this tool covers only the pool.",
  inputSchema: CreatePoolSchema,
});
