import { z } from "zod";

const shopItemShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  imageUrl: z.string().url().optional(),
  /** Price summary string, e.g. "100 gold" / "$1.99". */
  price: z.string().max(80),
  /** Whether the item is currently available. */
  available: z.boolean().optional(),
  /** Optional badge: "Limited", "New", etc. */
  badge: z.string().max(40).optional(),
});

export const shopGridPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Bind a specific shop config from the platform. */
  shopId: z.string().min(1).optional(),
  /** Optional explicit items. SSR loader replaces via initialData. */
  items: z.array(shopItemShape).max(48).optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  emptyMessage: z.string().max(200).optional(),
});

export type ShopGridProps = z.infer<typeof shopGridPropsSchema>;

export interface ShopGridInitialData {
  items: Array<{
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    price: string;
    available?: boolean;
    badge?: string;
  }>;
}

/**
 * Card grid of purchasable items. Each card has a buy button that
 * posts to the platform shop endpoint — pages worker proxies to
 * `/api/v1/client/shop/items/{id}/redeem`.
 *
 * Falls back to an empty-state copy if neither static `items` nor
 * `initialData.items` is provided.
 */
export function ShopGrid(
  props: ShopGridProps & { initialData?: ShopGridInitialData },
) {
  const items = props.initialData?.items ?? props.items ?? [];
  const cols = props.columns ?? Math.min(items.length || 3, 3);
  const colsClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="shop-grid"
      data-shop-id={props.shopId ?? ""}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight">{props.heading}</h2>
        ) : null}
        {props.intro ? (
          <p className="text-sm opacity-75">{props.intro}</p>
        ) : null}

        {items.length === 0 ? (
          <p className="text-center text-sm opacity-60" data-empty="true">
            {props.emptyMessage ?? "No items available right now."}
          </p>
        ) : (
          <ul className={`grid grid-cols-1 gap-5 ${colsClass}`}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 overflow-hidden rounded-lg border border-white/10 bg-white/5"
                data-item-id={item.id}
                data-available={item.available !== false ? "true" : "false"}
              >
                {item.imageUrl ? (
                  <div className="aspect-square w-full overflow-hidden bg-black/30">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 px-4 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">
                      {item.name}
                    </h3>
                    {item.badge ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="text-xs opacity-70 line-clamp-3">
                      {item.description}
                    </p>
                  ) : null}
                  <form
                    method="post"
                    action={`/api/v1/client/shop/items/${item.id}/redeem`}
                    className="mt-auto"
                  >
                    <button
                      type="submit"
                      disabled={item.available === false}
                      className="w-full rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--page-primary, #ff6b35)",
                        color: "var(--page-primary-fg, #ffffff)",
                      }}
                    >
                      {item.available === false ? "Sold out" : item.price}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
