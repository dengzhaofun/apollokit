import { z } from "zod";

const leaderboardEntryShape = z.object({
  rank: z.number().int().min(1),
  endUserId: z.string().min(1),
  displayName: z.string().max(80).optional(),
  avatarUrl: z.string().url().optional(),
  /** The score / xp / etc. — formatted string, e.g. "12,450". */
  score: z.string().max(40),
  isMe: z.boolean().optional(),
});

export const leaderboardCardPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  /** Specific leaderboard binding. */
  leaderboardId: z.string().min(1).optional(),
  /** Top N to display — UI hint, loader is responsible for honouring. */
  topN: z.number().int().min(3).max(100).optional(),
  /** Static fixture for AI scaffolding / no-loader path. */
  entries: z.array(leaderboardEntryShape).max(100).optional(),
  scoreLabel: z.string().max(40).optional(),
  emptyMessage: z.string().max(200).optional(),
});

export type LeaderboardCardProps = z.infer<typeof leaderboardCardPropsSchema>;

export interface LeaderboardCardInitialData {
  entries: Array<{
    rank: number;
    endUserId: string;
    displayName?: string;
    avatarUrl?: string;
    score: string;
    isMe?: boolean;
  }>;
  /** Player's own rank if outside the top N (otherwise null). */
  selfRank: {
    rank: number;
    score: string;
    displayName?: string;
  } | null;
}

/**
 * Top-N leaderboard with optional "your rank" footer when the player
 * is outside the top N. Highlights the current player's row inline if
 * they ARE in the top N (server marks `isMe: true`).
 */
export function LeaderboardCard(
  props: LeaderboardCardProps & { initialData?: LeaderboardCardInitialData },
) {
  const entries = props.initialData?.entries ?? props.entries ?? [];
  const topN = props.topN ?? 10;
  const truncated = entries.slice(0, topN);
  const selfRank = props.initialData?.selfRank ?? null;
  const scoreLabel = props.scoreLabel ?? "Score";

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="leaderboard-card"
      data-leaderboard-id={props.leaderboardId ?? ""}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight">{props.heading}</h2>
        ) : null}

        {truncated.length === 0 ? (
          <p className="text-center text-sm opacity-60" data-empty="true">
            {props.emptyMessage ?? "No rankings yet."}
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {truncated.map((e) => (
              <li
                key={`${e.rank}-${e.endUserId}`}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                  e.isMe ? "bg-amber-500/10" : ""
                }`}
                data-rank={e.rank}
                data-self={e.isMe ? "true" : "false"}
              >
                <span
                  className={`w-7 text-right tabular-nums ${
                    e.rank <= 3 ? "font-bold" : "opacity-70"
                  }`}
                >
                  {e.rank}
                </span>
                {e.avatarUrl ? (
                  <img
                    src={e.avatarUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-white/10" />
                )}
                <span className="flex-1 truncate text-left">
                  {e.displayName ?? e.endUserId}
                  {e.isMe ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">
                      you
                    </span>
                  ) : null}
                </span>
                <span className="font-mono tabular-nums opacity-90">
                  {e.score}
                </span>
              </li>
            ))}
          </ol>
        )}

        {selfRank ? (
          <div
            className="flex items-center justify-between rounded-md border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm"
            data-self-rank={selfRank.rank}
          >
            <span className="font-medium">Your rank</span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums opacity-80">#{selfRank.rank}</span>
              <span className="font-mono tabular-nums">
                {selfRank.score}
              </span>
            </span>
          </div>
        ) : null}

        <p className="text-center text-[11px] uppercase tracking-wide opacity-50">
          {scoreLabel}
        </p>
      </div>
    </section>
  );
}
