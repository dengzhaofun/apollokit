import { z } from "zod";

const featureItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(600).optional(),
  iconUrl: z.string().url().optional(),
  // Single-emoji shortcut so AI doesn't have to upload an image to ship
  // a passable card. Renderer falls back from iconUrl to icon to none.
  icon: z.string().max(8).optional(),
});

export const featureGridPropsSchema = z.object({
  heading: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  items: z.array(featureItemSchema).min(1).max(12),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

export type FeatureGridProps = z.infer<typeof featureGridPropsSchema>;

/**
 * 3-6 image+text feature cards. Used to highlight selling points,
 * activity perks, or "how to participate" steps.
 *
 * Tailwind grid; column count defaults to `min(items.length, 3)`.
 */
export function FeatureGrid(props: FeatureGridProps) {
  const cols = props.columns ?? Math.min(props.items.length, 3);
  const gridColsClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section
      className="w-full px-6 py-12 sm:py-16"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="feature-grid"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {props.heading || props.intro ? (
          <header className="flex flex-col gap-2 text-center">
            {props.heading ? (
              <h2 className="text-3xl font-bold tracking-tight">
                {props.heading}
              </h2>
            ) : null}
            {props.intro ? (
              <p className="text-base opacity-75">{props.intro}</p>
            ) : null}
          </header>
        ) : null}
        <ul className={`grid grid-cols-1 gap-6 ${gridColsClass}`}>
          {props.items.map((item, idx) => (
            <li
              key={idx}
              className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md text-2xl"
                style={{
                  backgroundColor: "var(--page-primary, #ff6b35)",
                  color: "var(--page-primary-fg, #ffffff)",
                }}
              >
                {item.iconUrl ? (
                  <img
                    src={item.iconUrl}
                    alt=""
                    className="h-6 w-6 object-contain"
                  />
                ) : item.icon ? (
                  <span aria-hidden="true">{item.icon}</span>
                ) : (
                  <span aria-hidden="true">★</span>
                )}
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              {item.description ? (
                <p className="text-sm opacity-75">{item.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
