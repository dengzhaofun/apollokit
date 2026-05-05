import { z } from "zod";

const mailEntryShape = z.object({
  id: z.string().min(1),
  subject: z.string().min(1).max(200),
  preview: z.string().max(400).optional(),
  /** Free-form summary of attachments, e.g. "+100 gold, +1 chest". */
  rewardSummary: z.string().max(200).optional(),
  receivedAt: z.string().min(1),
  read: z.boolean().optional(),
  claimed: z.boolean().optional(),
});

export const mailInboxPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Static mail items — replaced by SSR loader's initialData. */
  items: z.array(mailEntryShape).max(100).optional(),
  /** Show a "Claim all" button at the top. */
  showClaimAll: z.boolean().optional(),
  emptyMessage: z.string().max(200).optional(),
});

export type MailInboxProps = z.infer<typeof mailInboxPropsSchema>;

export interface MailInboxInitialData {
  items: Array<{
    id: string;
    subject: string;
    preview?: string;
    rewardSummary?: string;
    receivedAt: string;
    read?: boolean;
    claimed?: boolean;
  }>;
  /** How many mails still have unclaimed rewards. Drives the bulk CTA. */
  claimableCount: number;
}

/**
 * In-page mail inbox. Each row is a single mail with a "Claim" button
 * for items that have rewards. The bulk "Claim all" form is only
 * rendered when `showClaimAll` is set AND `claimableCount > 0`.
 */
export function MailInbox(
  props: MailInboxProps & { initialData?: MailInboxInitialData },
) {
  const items = props.initialData?.items ?? props.items ?? [];
  const claimableCount = props.initialData?.claimableCount ?? 0;

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="mail-inbox"
      data-claimable-count={claimableCount}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            {props.heading ? (
              <h2 className="text-2xl font-bold tracking-tight">
                {props.heading}
              </h2>
            ) : null}
            {props.intro ? (
              <p className="text-sm opacity-75">{props.intro}</p>
            ) : null}
          </div>
          {props.showClaimAll && claimableCount > 0 ? (
            <form method="post" action="/api/v1/client/mail/claim-all">
              <button
                type="submit"
                className="rounded-md px-4 py-2 text-xs font-semibold shadow-sm transition hover:opacity-90"
                style={{
                  backgroundColor: "var(--page-primary, #ff6b35)",
                  color: "var(--page-primary-fg, #ffffff)",
                }}
              >
                Claim all ({claimableCount})
              </button>
            </form>
          ) : null}
        </header>

        {items.length === 0 ? (
          <p className="text-center text-sm opacity-60" data-empty="true">
            {props.emptyMessage ?? "Your inbox is empty."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {items.map((m) => (
              <li
                key={m.id}
                className={`flex flex-col gap-2 px-4 py-3 text-sm ${
                  m.read ? "opacity-70" : ""
                }`}
                data-mail-id={m.id}
                data-read={m.read ? "true" : "false"}
                data-claimed={m.claimed ? "true" : "false"}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-snug">
                    {m.subject}
                  </h3>
                  <time
                    dateTime={m.receivedAt}
                    className="shrink-0 text-[11px] opacity-60"
                  >
                    {m.receivedAt}
                  </time>
                </div>
                {m.preview ? (
                  <p className="text-xs opacity-80 line-clamp-2">{m.preview}</p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  {m.rewardSummary ? (
                    <span className="text-[11px] font-medium opacity-90">
                      {m.rewardSummary}
                    </span>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  {m.rewardSummary && !m.claimed ? (
                    <form
                      method="post"
                      action={`/api/v1/client/mail/${m.id}/claim`}
                    >
                      <button
                        type="submit"
                        className="rounded-md border border-white/20 px-3 py-1 text-[11px] font-medium hover:bg-white/10"
                      >
                        Claim
                      </button>
                    </form>
                  ) : m.claimed ? (
                    <span className="text-[11px] opacity-50">Claimed</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
