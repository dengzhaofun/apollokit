import { createFileRoute } from "@tanstack/react-router";

import { loadProjectBySlug, resolveSlugFromHost } from "../lib/load-project";

/**
 * `/robots.txt` — per-subdomain. Allows everything for resolved
 * project subdomains; disallows everything otherwise (unknown host /
 * unknown slug).
 *
 * The `/preview/` path is always disallowed — drafts must never be
 * indexed even if a preview JWT happened to leak into a crawler's
 * request log.
 */
const ROBOTS_DISALLOW_ALL = `User-agent: *
Disallow: /
`;

function buildRobotsAllowed(host: string): string {
  return `User-agent: *
Allow: /
Disallow: /preview/
Sitemap: https://${host}/sitemap.xml
`;
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const host = request.headers.get("host") ?? "";
        const slug = resolveSlugFromHost(host);
        const project = slug ? await loadProjectBySlug(slug) : null;
        const body = project ? buildRobotsAllowed(host) : ROBOTS_DISALLOW_ALL;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
