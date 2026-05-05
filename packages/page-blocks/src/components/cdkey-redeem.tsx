import { z } from "zod";

export const cdkeyRedeemPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Optional campaign filter — blank = accept any code. */
  campaignId: z.string().min(1).optional(),
  /** Placeholder text inside the input. */
  inputPlaceholder: z.string().max(80).optional(),
  ctaLabel: z.string().max(60).optional(),
  /** Copy shown after a successful redemption — operator-controlled. */
  successMessage: z.string().max(200).optional(),
});

export type CdkeyRedeemProps = z.infer<typeof cdkeyRedeemPropsSchema>;

/**
 * Single-input CDKey redemption form. Pure form post — no JS required.
 * The pages worker proxies the action to
 * `/api/v1/client/cdkey/redeem` and re-renders with whatever the
 * server returns (success line / error line).
 *
 * Static block — there's no SSR data to load before render.
 */
export function CdkeyRedeem(props: CdkeyRedeemProps) {
  const placeholder = props.inputPlaceholder ?? "Enter your code";
  const ctaLabel = props.ctaLabel ?? "Redeem";

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="cdkey-redeem"
      data-campaign-id={props.campaignId ?? ""}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-center">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight">{props.heading}</h2>
        ) : null}
        {props.intro ? (
          <p className="text-sm opacity-75">{props.intro}</p>
        ) : null}
        <form
          method="post"
          action="/api/v1/client/cdkey/redeem"
          className="flex flex-col gap-3"
        >
          {props.campaignId ? (
            <input
              type="hidden"
              name="campaignId"
              value={props.campaignId}
            />
          ) : null}
          <input
            type="text"
            name="code"
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            required
            minLength={4}
            maxLength={64}
            className="rounded-md border border-white/15 bg-black/20 px-4 py-2.5 text-center text-sm font-mono uppercase tracking-wider placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-90"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {ctaLabel}
          </button>
        </form>
        {props.successMessage ? (
          <p className="text-xs opacity-60" data-cdkey-help>
            {props.successMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
