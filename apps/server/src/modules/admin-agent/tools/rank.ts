import { tool } from "ai";

import { CreateSeasonSchema } from "../../rank/validators";

/**
 * Rank has both season-level and tier-level configuration; MVP only
 * proposes the season top-level. Tier configs are edited per-tier on
 * the season detail page after creation.
 */
export const applyRankConfig = tool({
  description:
    "Propose a complete rank-season configuration to apply to the form. " +
    "The user reviews before saving. Per-tier reward and threshold " +
    "tweaks happen on the season detail page; this tool covers only " +
    "the season-level fields.",
  inputSchema: CreateSeasonSchema,
});
