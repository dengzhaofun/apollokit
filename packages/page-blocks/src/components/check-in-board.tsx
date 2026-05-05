import { z } from "zod";

const checkInDayShape = z.object({
  /** Day index — 1..N within the cycle. */
  day: z.number().int().min(1).max(31),
  /** Display label, e.g. "Day 1", "Day 7". */
  label: z.string().max(40).optional(),
  /** Reward summary text, e.g. "+10 gold". */
  reward: z.string().max(120).optional(),
  /** Whether the player has already claimed this day. */
  claimed: z.boolean().optional(),
  /** Whether this day is the current claimable day. */
  current: z.boolean().optional(),
});

export const checkInBoardPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  /** "7-day" | "monthly" — visual layout hint. */
  cycleLength: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  /** Static day rows. SSR loader will replace via initialData. */
  days: z.array(checkInDayShape).max(31).optional(),
  ctaLabel: z.string().max(60).optional(),
});

export type CheckInBoardProps = z.infer<typeof checkInBoardPropsSchema>;

export interface CheckInBoardInitialData {
  cycleLength: 7 | 14 | 30;
  days: Array<{
    day: number;
    label?: string;
    reward?: string;
    claimed?: boolean;
    current?: boolean;
  }>;
  /** Whether today's reward is already claimed. Drives the CTA state. */
  todayClaimed: boolean;
}

/**
 * Daily check-in board. Shows a row/grid of days; each cell renders
 * its claim status. The CTA at the bottom is a `<form method="post">`
 * — no JS required for the basic claim flow. The pages worker proxies
 * the form action to `/api/v1/client/check-in/claim`.
 *
 * `initialData` (when supplied by the SSR loader) overrides the static
 * `days` prop so AI-authored skeletons fall back gracefully if the
 * loader fails.
 */
export function CheckInBoard(
  props: CheckInBoardProps & { initialData?: CheckInBoardInitialData },
) {
  const cycle =
    props.initialData?.cycleLength ?? props.cycleLength ?? 7;
  const days: CheckInBoardInitialData["days"] =
    props.initialData?.days ??
    props.days ??
    Array.from({ length: cycle }, (_, i) => ({ day: i + 1 }));
  const todayClaimed = props.initialData?.todayClaimed ?? false;
  const ctaLabel = props.ctaLabel ?? (todayClaimed ? "Claimed" : "Claim today");

  const cols = cycle === 30 ? "grid-cols-5 sm:grid-cols-6" : "grid-cols-7";

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="check-in-board"
      data-cycle={cycle}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight text-center">
            {props.heading}
          </h2>
        ) : null}
        <ul className={`grid gap-2 ${cols}`}>
          {days.map((d) => (
            <li
              key={d.day}
              className={`flex flex-col items-center justify-center gap-1 rounded-md border p-2 text-xs ${
                d.claimed
                  ? "border-white/10 bg-white/10 opacity-60"
                  : d.current
                    ? "border-amber-400 bg-amber-400/15"
                    : "border-white/10 bg-white/5"
              }`}
              data-day={d.day}
              data-claimed={d.claimed ? "true" : "false"}
              data-current={d.current ? "true" : "false"}
            >
              <span className="text-[11px] uppercase tracking-wide opacity-70">
                {d.label ?? `Day ${d.day}`}
              </span>
              {d.reward ? (
                <span className="text-[11px] font-semibold">{d.reward}</span>
              ) : null}
              {d.claimed ? (
                <span aria-hidden="true" className="text-base">✓</span>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          method="post"
          action="/api/v1/client/check-in/claim"
          className="flex justify-center"
          data-form="check-in-claim"
        >
          <button
            type="submit"
            disabled={todayClaimed}
            className="rounded-md px-6 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {ctaLabel}
          </button>
        </form>
      </div>
    </section>
  );
}
