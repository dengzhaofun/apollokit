import { z } from "zod";

export const heroPropsSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional(),
  ctaLabel: z.string().max(80).optional(),
  ctaHref: z.string().url().optional(),
  backgroundImageUrl: z.string().url().optional(),
  // Layout hints — render decides centering, padding, etc.
  align: z.enum(["left", "center"]).optional().default("center"),
});

export type HeroProps = z.infer<typeof heroPropsSchema>;

/**
 * Above-the-fold marketing hero — big headline, optional subtitle,
 * optional CTA. Background image renders behind the text with a
 * darken overlay for legibility.
 *
 * No client-side state — fully SSR-safe.
 */
export function Hero(props: HeroProps) {
  const align = props.align ?? "center";
  const alignClass =
    align === "center" ? "text-center items-center" : "text-left items-start";

  return (
    <section
      className={`relative flex w-full flex-col gap-6 overflow-hidden px-6 py-16 sm:py-24 ${alignClass}`}
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="hero"
    >
      {props.backgroundImageUrl ? (
        <>
          <img
            src={props.backgroundImageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/60"
          />
        </>
      ) : null}
      <div
        className={`relative z-10 flex w-full max-w-3xl flex-col gap-4 ${alignClass}`}
      >
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {props.title}
        </h1>
        {props.subtitle ? (
          <p className="text-lg opacity-80 sm:text-xl">{props.subtitle}</p>
        ) : null}
        {props.ctaLabel ? (
          <a
            href={props.ctaHref ?? "#"}
            className="mt-2 inline-flex w-fit items-center justify-center rounded-md px-6 py-3 text-base font-semibold shadow-sm transition hover:opacity-90"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {props.ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
