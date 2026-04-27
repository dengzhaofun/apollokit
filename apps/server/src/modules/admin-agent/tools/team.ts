import { tool } from "ai";

import { CreateConfigSchema } from "../../team/validators";

/**
 * Team module has both `CreateConfigSchema` (the team-system config the
 * admin form fills) and `CreateTeamSchema` (a single team row). The
 * admin's `TeamConfigForm` corresponds to the config — that's what we
 * expose.
 */
export const applyTeamConfig = tool({
  description:
    "Propose a complete team-system configuration to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateConfigSchema,
});
