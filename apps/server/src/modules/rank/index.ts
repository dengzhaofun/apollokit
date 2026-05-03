/**
 * Rank module barrel.
 *
 * Wiring notes:
 *   - Depends on shared `deps` (db + events).
 *   - Pulls `leaderboardService` via a lazy getter so module-load order
 *     across the tree is not fixed (if another module ever imports `rank`
 *     before `leaderboard`, the getter still finds the singleton at
 *     resolve-time).
 *   - Registers the 4 rank events so the admin event-catalog lists them.
 *
 * Tests import `createRankService` directly and pass mocks for `leaderboard`
 * — do not reach through this barrel in unit tests.
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { leaderboardService } from "../leaderboard";
import { createRankService, type LeaderboardLike } from "./service";

registerEvent({
  name: "rank.match_settled",
  owner: "rank",
  description:
    "Fired once per participant after a ranked match is settled. " +
    "Carries the per-user MMR / rankScore delta; task-bridge reads this " +
    "to count 'wins per user' style goals.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "matchId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "matchTeamId", type: "string", required: true },
    { path: "win", type: "boolean", required: true },
    { path: "rankScoreBefore", type: "number", required: true },
    { path: "rankScoreAfter", type: "number", required: true },
    { path: "mmrBefore", type: "number", required: true },
    { path: "mmrAfter", type: "number", required: true },
    { path: "promoted", type: "boolean", required: true },
    { path: "demoted", type: "boolean", required: true },
    { path: "settledAt", type: "string", required: true },
  ],
});

registerEvent({
  name: "rank.tier_promoted",
  owner: "rank",
  description:
    "A participant crossed into a higher tier during settlement. Fired " +
    "after `rank.match_settled` for the same user.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "matchId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "fromTierId", type: "string", required: false },
    { path: "toTierId", type: "string", required: true },
  ],
});

registerEvent({
  name: "rank.tier_demoted",
  owner: "rank",
  description:
    "A participant dropped into a lower tier during settlement (all " +
    "protection shields have been consumed).",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "matchId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "fromTierId", type: "string", required: false },
    { path: "toTierId", type: "string", required: true },
  ],
});

registerEvent({
  name: "rank.season_finalized",
  owner: "rank",
  description:
    "A season was finalized and its snapshot rows were written. This is " +
    "a system-level signal without a single user subject — do not forward " +
    "to task-bridge.",
  forwardToTask: false,
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "playerCount", type: "number", required: true },
    { path: "finalizedAt", type: "string", required: true },
  ],
});

export { createRankService };
export type { RankService, LeaderboardLike } from "./service";

// Structural adapter: cast `leaderboardService` to the narrow
// `LeaderboardLike` surface so rank only depends on what it actually
// calls (createConfig / updateConfig / contribute / getTop).
export const rankService = createRankService(
  deps,
  () => leaderboardService as unknown as LeaderboardLike,
);

export { rankRouter } from "./routes";
export { rankClientRouter } from "./client-routes";
