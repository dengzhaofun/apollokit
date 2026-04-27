/**
 * Map of module name → its `apply*` client-side tool. Used by
 * `buildToolsForSurface` to decide which apply tool (if any) to expose
 * for a given `<module>:create|edit` surface.
 *
 * Adding a module = one import + one entry.
 */

import { applyAnnouncementConfig } from "./announcement";
import { applyAssistPoolConfig } from "./assist-pool";
import { applyBadgeNodeConfig } from "./badge";
import { applyBannerConfig } from "./banner";
import { applyCdkeyBatch } from "./cdkey";
import { applyCharacterConfig } from "./character";
import { applyCheckInConfig } from "./check-in";
import { applyCurrencyDefinition } from "./currency";
import { applyLeaderboardConfig } from "./leaderboard";
import { applyLotteryConfig } from "./lottery";
import { applyMailConfig } from "./mail";
import { applyRankConfig } from "./rank";
import { applyShopProductConfig } from "./shop";
import { applyTeamConfig } from "./team";

/**
 * Module → apply-tool name + tool object. Keep the **name** here
 * matching the variable name above so the model and the admin frontend
 * agree on what the UIMessage `tool-<name>` part is called.
 */
export const APPLY_TOOL_BY_MODULE = {
  "announcement": { name: "applyAnnouncementConfig", tool: applyAnnouncementConfig },
  "assist-pool": { name: "applyAssistPoolConfig", tool: applyAssistPoolConfig },
  "badge": { name: "applyBadgeNodeConfig", tool: applyBadgeNodeConfig },
  "banner": { name: "applyBannerConfig", tool: applyBannerConfig },
  "cdkey": { name: "applyCdkeyBatch", tool: applyCdkeyBatch },
  "character": { name: "applyCharacterConfig", tool: applyCharacterConfig },
  "check-in": { name: "applyCheckInConfig", tool: applyCheckInConfig },
  "currency": { name: "applyCurrencyDefinition", tool: applyCurrencyDefinition },
  "leaderboard": { name: "applyLeaderboardConfig", tool: applyLeaderboardConfig },
  "lottery": { name: "applyLotteryConfig", tool: applyLotteryConfig },
  "mail": { name: "applyMailConfig", tool: applyMailConfig },
  "rank": { name: "applyRankConfig", tool: applyRankConfig },
  "shop": { name: "applyShopProductConfig", tool: applyShopProductConfig },
  "team": { name: "applyTeamConfig", tool: applyTeamConfig },
} as const;

export type ApplyableModule = keyof typeof APPLY_TOOL_BY_MODULE;
