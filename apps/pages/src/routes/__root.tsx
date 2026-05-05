import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

/**
 * Root shell for the apollokit-pages worker. Operator-built landing
 * pages render inside `<body>{children}</body>` — every page route
 * (catch-all, __preview, sitemap, robots) is a sibling under this
 * root.
 *
 * Devtools are intentionally NOT included here (admin keeps them; this
 * worker is end-user-facing and ships zero dev plumbing). Per-page
 * SEO `meta` tags come from each route's own `head()` — this root only
 * supplies the bare-minimum charset / viewport / stylesheet.
 */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
