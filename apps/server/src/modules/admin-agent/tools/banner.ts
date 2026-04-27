import { tool } from "ai";

import { CreateBannerGroupSchema } from "../../banner/validators";

/**
 * Banner has two top-level entities: groups (containers, the form-bearing
 * one in admin) and individual banners (children of a group, edited from
 * the group's detail page). MVP only proposes group-level config.
 */
export const applyBannerConfig = tool({
  description:
    "Propose a complete banner-group configuration to apply to the form. " +
    "The user reviews before saving. Banners themselves are added later " +
    "from the group's detail page; this tool covers only the group.",
  inputSchema: CreateBannerGroupSchema,
});
