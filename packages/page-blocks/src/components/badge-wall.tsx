import { z } from "zod";

const badgeShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  iconUrl: z.string().url().optional(),
  /** Single-emoji shortcut when no iconUrl. */
  icon: z.string().max(8).optional(),
  /** Tier hint — "bronze" / "silver" / "gold" / "platinum". */
  tier: z.string().max(40).optional(),
  /** True when the player has earned this badge. */
  earned: z.boolean().optional(),
  /** Free-form date string for "earned at". */
  earnedAt: z.string().max(40).optional(),
});

export const badgeWallPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Hide unearned badges. Default: show with reduced opacity. */
  earnedOnly: z.boolean().optional(),
  /** Static badge fixture — loader replaces via initialData. */
  badges: z.array(badgeShape).max(60).optional(),
  columns: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
  emptyMessage: z.string().max(200).optional(),
});

export type BadgeWallProps = z.infer<typeof badgeWallPropsSchema>;

export interface BadgeWallInitialData {
  badges: Array<{
    id: string;
    name: string;
    description?: string;
    iconUrl?: string;
    icon?: string;
    tier?: string;
    earned?: boolean;
    earnedAt?: string;
  }>;
  /** Counts shown in the header summary. */
  earnedCount: number;
  totalCount: number;
}

const TIER_COLORS: Record<string, string> = {
  bronze: "from-amber-700 to-amber-900",
  silver: "from-slate-300 to-slate-500",
  gold: "from-amber-300 to-amber-500",
  platinum: "from-cyan-200 to-cyan-400",
};

/**
 * Achievement / badge wall. Pure display — no claim button (badges
 * are awarded server-side by gameplay events). Earned badges have
 * full opacity; unearned ones are dimmed to ~30% so the player gets
 * a sense of progression without an extra "locked" overlay.
 */
export function BadgeWall(
  props: BadgeWallProps & { initialData?: BadgeWallInitialData },
) {
  const allBadges = props.initialData?.badges ?? props.badges ?? [];
  const visibleBadges = props.earnedOnly
    ? allBadges.filter((b) => b.earned)
    : allBadges;
  const cols = props.columns ?? 4;
  const colsClass =
    cols === 3
      ? "grid-cols-3"
      : cols === 5
        ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"
        : cols === 6
          ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  const earnedCount =
    props.initialData?.earnedCount ??
    allBadges.filter((b) => b.earned).length;
  const totalCount = props.initialData?.totalCount ?? allBadges.length;

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="badge-wall"
      data-earned-count={earnedCount}
      data-total-count={totalCount}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header className="flex flex-col items-center gap-2 text-center">
          {props.heading ? (
            <h2 className="text-2xl font-bold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          {props.intro ? (
            <p className="text-sm opacity-75">{props.intro}</p>
          ) : null}
          {totalCount > 0 ? (
            <span
              className="rounded-full border border-white/15 px-3 py-0.5 text-xs opacity-80"
              data-summary
            >
              {earnedCount} / {totalCount} earned
            </span>
          ) : null}
        </header>

        {visibleBadges.length === 0 ? (
          <p className="text-center text-sm opacity-60" data-empty="true">
            {props.emptyMessage ?? "No badges yet."}
          </p>
        ) : (
          <ul className={`grid gap-4 ${colsClass}`}>
            {visibleBadges.map((b) => {
              const tierGradient =
                (b.tier && TIER_COLORS[b.tier.toLowerCase()]) ??
                "from-slate-500 to-slate-700";
              return (
                <li
                  key={b.id}
                  className={`flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-4 text-center transition ${
                    b.earned ? "" : "opacity-30 grayscale"
                  }`}
                  data-badge-id={b.id}
                  data-earned={b.earned ? "true" : "false"}
                  data-tier={b.tier ?? ""}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${tierGradient} text-2xl shadow-md`}
                  >
                    {b.iconUrl ? (
                      <img
                        src={b.iconUrl}
                        alt=""
                        className="h-9 w-9 object-contain"
                      />
                    ) : (
                      <span aria-hidden="true">{b.icon ?? "🏅"}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold leading-tight">
                    {b.name}
                  </h3>
                  {b.description ? (
                    <p className="text-[11px] leading-snug opacity-70 line-clamp-3">
                      {b.description}
                    </p>
                  ) : null}
                  {b.earned && b.earnedAt ? (
                    <span className="text-[10px] uppercase tracking-wide opacity-60">
                      {b.earnedAt}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
