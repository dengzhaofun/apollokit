/**
 * C-end client routes for the rank module.
 *
 * Mounted at /api/client/rank. These are consumed directly by the tenant's
 * END USERS (game clients), not by their backend server.
 *
 *   requireClientCredential — validates x-api-key (cpk_...)
 *   requireClientUser       — verifies x-end-user-id + x-user-hash HMAC
 *
 * READ-ONLY by design. Match settlement happens server-to-server via the
 * admin `POST /api/rank/settle` endpoint, because letting a game client
 * self-report a match result opens an obvious "claim every match as a win"
 * cheat path. The endpoints here only let a player:
 *   - query their own current standing (`/state`)
 *   - query their own recent match history (`/history`)
 *   - read the global / tier-filtered leaderboard (`/leaderboard`)
 */

import { createRoute, z } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { clientAuthHeaders } from "../../middleware/client-auth-headers";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { rankService } from "./index";
import type { RankMatchParticipant } from "./types";
import {
  HistoryQuerySchema,
  LadderLocatorQuerySchema,
  LeaderboardQuerySchema,
  ParticipantDeltaResponseSchema,
  PlayerRankViewResponseSchema,
} from "./validators";

const TAG = "Rank (Client)";

function serializeParticipant(row: RankMatchParticipant) {
  return {
    id: row.id,
    matchId: row.matchId,
    endUserId: row.endUserId,
    teamId: row.teamId,
    placement: row.placement,
    win: row.win,
    mmrBefore: row.mmrBefore,
    mmrAfter: row.mmrAfter,
    rankScoreBefore: row.rankScoreBefore,
    rankScoreAfter: row.rankScoreAfter,
    starsDelta: row.starsDelta,
    subtierBefore: row.subtierBefore,
    subtierAfter: row.subtierAfter,
    starsBefore: row.starsBefore,
    starsAfter: row.starsAfter,
    tierBeforeId: row.tierBeforeId,
    tierAfterId: row.tierAfterId,
    promoted: row.promoted,
    demoted: row.demoted,
    protectionApplied:
      (row.protectionApplied ?? null) as Record<string, unknown> | null,
  };
}

export const rankClientRouter = makeApiRouter();

rankClientRouter.use("*", requireClientCredential);
rankClientRouter.use("*", requireClientUser);

/* ── GET /state — current player's standing ─────────────────── */

rankClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/state",
    tags: [TAG],
    summary:
      "Get the caller's current standing in a ladder. " +
      "Resolves the season by `seasonId` or the active season of `tierConfigAlias`.",
    request: {
      headers: clientAuthHeaders,
      query: LadderLocatorQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PlayerRankViewResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { seasonId, tierConfigAlias } = c.req.valid("query");
    const view = await rankService.getPlayerState({
      organizationId: orgId,
      seasonId,
      tierConfigAlias,
      endUserId,
    });
    return c.json(ok(view), 200);
  },
);

/* ── GET /history — caller's recent match deltas ─────────────── */

rankClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/history",
    tags: [TAG],
    summary: "List the caller's recent match participant rows (desc by id).",
    request: {
      headers: clientAuthHeaders,
      query: HistoryQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(
              z.object({
                items: z.array(ParticipantDeltaResponseSchema),
                nextCursor: z.string().optional(),
              }),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { seasonId, tierConfigAlias, limit, cursor } = c.req.valid("query");
    // If only tierConfigAlias is provided, resolve the active season first.
    const effectiveSeasonId =
      seasonId ??
      (
        await rankService.getPlayerState({
          organizationId: orgId,
          tierConfigAlias,
          endUserId,
        }).catch(() => null)
      )?.seasonId;
    const { items, nextCursor } = await rankService.getPlayerHistory({
      organizationId: orgId,
      endUserId,
      seasonId: effectiveSeasonId,
      limit,
      cursor,
    });
    return c.json(
      ok({
        items: items.map(serializeParticipant),
        nextCursor: nextCursor ?? undefined,
      }),
      200,
    );
  },
);

/* ── GET /leaderboard — global or tier-filtered board ────────── */

rankClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/leaderboard",
    tags: [TAG],
    summary:
      "Read the season leaderboard. Global (no tierId) delegates to the " +
      "leaderboard module; tier-filtered goes through PG directly.",
    request: {
      headers: clientAuthHeaders,
      query: LeaderboardQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(
              z.object({
                tier: z
                  .object({
                    id: z.string(),
                    alias: z.string(),
                  })
                  .optional(),
                rankings: z.array(
                  z.object({
                    rank: z.number().int().optional(),
                    endUserId: z.string(),
                    score: z.number().optional(),
                    displaySnapshot: z
                      .record(z.string(), z.unknown())
                      .nullable()
                      .optional(),
                  }),
                ),
                self: z
                  .object({
                    rank: z.number().int().nullable(),
                    score: z.number().nullable(),
                  })
                  .optional(),
                items: z.array(PlayerRankViewResponseSchema).optional(),
              }),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const {
      seasonId,
      tierConfigAlias,
      tierId,
      limit,
      around,
    } = c.req.valid("query");

    if (tierId) {
      // Tier-internal board via PG.
      const items = await rankService.getTierLeaderboard({
        organizationId: orgId,
        seasonId,
        tierConfigAlias,
        tierId,
        limit,
      });
      return c.json(ok({ rankings: [], items }), 200);
    }

    // Global season board, delegate to leaderboard.
    const top = await rankService.getGlobalLeaderboard({
      organizationId: orgId,
      seasonId,
      tierConfigAlias,
      limit,
      endUserId: around === "self" ? endUserId : undefined,
    });
    return c.json(
      ok({
        rankings: top.rankings,
        self: top.self,
        items: [],
      }),
      200,
    );
  },
);
