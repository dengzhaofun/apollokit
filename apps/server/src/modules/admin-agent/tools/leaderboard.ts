import { tool } from "ai";

import { CreateConfigSchema } from "../../leaderboard/validators";

export const applyLeaderboardConfig = tool({
  description:
    "Propose a complete leaderboard configuration to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateConfigSchema,
});
