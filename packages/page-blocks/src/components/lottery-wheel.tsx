import { z } from "zod";

const lotteryPrizeShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  imageUrl: z.string().url().optional(),
  /** Soft hint, e.g. "Rare" / "Common". */
  rarity: z.string().max(40).optional(),
});

export const lotteryWheelPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Specific lottery config to bind. */
  lotteryId: z.string().min(1).optional(),
  /** Static prize summary. SSR loader can override via initialData. */
  prizes: z.array(lotteryPrizeShape).max(24).optional(),
  /** Display copy for the cost line, e.g. "1 spin = 100 gold". */
  costLabel: z.string().max(120).optional(),
  ctaLabel: z.string().max(60).optional(),
});

export type LotteryWheelProps = z.infer<typeof lotteryWheelPropsSchema>;

export interface LotteryWheelInitialData {
  prizes: Array<{
    id: string;
    name: string;
    imageUrl?: string;
    rarity?: string;
  }>;
  /** How many free / paid pulls the player has left right now. */
  pullsRemaining: number;
  /** Whether the player can pull right now (e.g. has currency). */
  canPull: boolean;
  /** History of recent pulls — newest first, max 5. */
  recentPulls?: Array<{ prizeId: string; prizeName: string; at: string }>;
}

/**
 * Lottery / gacha wheel block. Renders the prize pool + a pull form;
 * actual roulette animation is intentionally omitted in v1 — the page
 * just shows the result text after the form posts. Gives operators the
 * acquisition+conversion surface without committing the runtime to a
 * canvas/WebGL animation.
 */
export function LotteryWheel(
  props: LotteryWheelProps & { initialData?: LotteryWheelInitialData },
) {
  const prizes = props.initialData?.prizes ?? props.prizes ?? [];
  const remaining = props.initialData?.pullsRemaining ?? null;
  const canPull = props.initialData?.canPull ?? true;
  const ctaLabel = props.ctaLabel ?? (canPull ? "Spin" : "No pulls left");

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="lottery-wheel"
      data-lottery-id={props.lotteryId ?? ""}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight">{props.heading}</h2>
        ) : null}
        {props.intro ? (
          <p className="max-w-xl text-sm opacity-75">{props.intro}</p>
        ) : null}

        {prizes.length > 0 ? (
          <ul
            className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
            data-prizes-count={prizes.length}
          >
            {prizes.map((p) => (
              <li
                key={p.id}
                className="flex flex-col items-center gap-1.5 rounded border border-white/10 bg-white/5 p-2 text-xs"
                data-prize-id={p.id}
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-black/30 text-base">
                    🎁
                  </div>
                )}
                <span className="line-clamp-2 leading-tight">{p.name}</span>
                {p.rarity ? (
                  <span className="text-[10px] uppercase opacity-60">
                    {p.rarity}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col items-center gap-2">
          {props.costLabel ? (
            <span className="text-xs opacity-75">{props.costLabel}</span>
          ) : null}
          {remaining != null ? (
            <span
              className="text-xs opacity-60"
              data-pulls-remaining={remaining}
            >
              {remaining} pull{remaining === 1 ? "" : "s"} remaining
            </span>
          ) : null}
        </div>

        <form
          method="post"
          action={`/api/v1/client/lottery${
            props.lotteryId ? `/${encodeURIComponent(props.lotteryId)}` : ""
          }/pull`}
        >
          <button
            type="submit"
            disabled={!canPull}
            className="rounded-md px-8 py-3 text-base font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {ctaLabel}
          </button>
        </form>

        {props.initialData?.recentPulls &&
        props.initialData.recentPulls.length > 0 ? (
          <ol className="mt-2 flex w-full flex-col gap-1 text-left text-xs opacity-70">
            {props.initialData.recentPulls.slice(0, 5).map((r, idx) => (
              <li key={idx}>
                <span className="opacity-60">{r.at}</span> · {r.prizeName}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
