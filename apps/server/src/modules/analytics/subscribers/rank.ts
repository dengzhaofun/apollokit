import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerRankSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("rank.match_settled", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "rank.match_settled",
      source: "rank",
      // amount = rankScore delta (positive/negative). Funnel-friendly
      // single scalar; before/after snapshots kept in eventData for
      // per-player timeseries.
      amount: p.rankScoreAfter - p.rankScoreBefore,
      eventData: {
        seasonId: p.seasonId,
        matchId: p.matchId,
        teamId: p.teamId,
        win: p.win,
        rankScoreBefore: p.rankScoreBefore,
        rankScoreAfter: p.rankScoreAfter,
        mmrBefore: p.mmrBefore,
        mmrAfter: p.mmrAfter,
        promoted: p.promoted,
        demoted: p.demoted,
        settledAt: p.settledAt,
      },
    });
  });

  events.on("rank.tier_promoted", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "rank.tier_promoted",
      source: "rank",
      eventData: {
        seasonId: p.seasonId,
        matchId: p.matchId,
        fromTierId: p.fromTierId,
        toTierId: p.toTierId,
      },
    });
  });

  events.on("rank.tier_demoted", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "rank.tier_demoted",
      source: "rank",
      eventData: {
        seasonId: p.seasonId,
        matchId: p.matchId,
        fromTierId: p.fromTierId,
        toTierId: p.toTierId,
      },
    });
  });

  events.on("rank.season_finalized", (p) => {
    write({
      orgId: p.organizationId,
      event: "rank.season_finalized",
      source: "rank",
      amount: p.playerCount,
      eventData: {
        seasonId: p.seasonId,
        finalizedAt: p.finalizedAt,
      },
    });
  });
}
