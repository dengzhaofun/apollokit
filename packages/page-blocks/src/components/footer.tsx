import { z } from "zod";

const footerLinkSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(2048),
});

export const footerPropsSchema = z.object({
  brandName: z.string().min(1).max(120),
  tagline: z.string().max(200).optional(),
  links: z.array(footerLinkSchema).max(20).optional(),
  // Free-text legal / regulatory line. Used for ICP filings, copyright,
  // address — anything that has to literally appear in the footer.
  legal: z.string().max(500).optional(),
  // ISO year shown in copyright; defaults to current year at render time.
  copyrightYear: z.number().int().min(1970).max(9999).optional(),
});

export type FooterProps = z.infer<typeof footerPropsSchema>;

/**
 * Simple footer — brand line, optional links column, legal/copyright.
 * Server-side rendering uses the supplied `copyrightYear` if present;
 * otherwise we fall back to `Date.UTC(now)` at SSR time so the year
 * doesn't drift between server-render and client-hydrate.
 */
export function Footer(props: FooterProps) {
  const year =
    props.copyrightYear ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0)).getUTCFullYear();

  return (
    <footer
      className="w-full border-t border-white/10 px-6 py-10 text-sm"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="footer"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold">{props.brandName}</span>
          {props.tagline ? (
            <span className="opacity-70">{props.tagline}</span>
          ) : null}
        </div>
        {props.links && props.links.length > 0 ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {props.links.map((link, idx) => (
              <li key={idx}>
                <a
                  href={link.href}
                  className="opacity-80 underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mx-auto mt-6 flex w-full max-w-5xl flex-col gap-1 border-t border-white/5 pt-4 text-xs opacity-60 sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {year} {props.brandName}
        </span>
        {props.legal ? <span>{props.legal}</span> : null}
      </div>
    </footer>
  );
}
