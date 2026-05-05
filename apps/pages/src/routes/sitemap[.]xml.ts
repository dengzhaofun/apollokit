import { createFileRoute } from "@tanstack/react-router";

import { loadProjectBySlug, resolveSlugFromHost } from "../lib/load-project";

/**
 * `/sitemap.xml` — emitted per project subdomain. Only enumerates the
 * pages of the project bound to the current host. Search engines crawl
 * through this; we deliberately don't enumerate ALL projects across
 * the platform from any single sitemap (would leak tenant slugs).
 *
 * The square-bracket-escaped filename `sitemap[.]xml` is TanStack file
 * routing's literal-character escape — the `.xml` becomes part of the
 * path instead of a route extension.
 */

function buildSitemapXml(host: string, paths: string[]): string {
  const origin = `https://${host}`;
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ];
  for (const path of paths) {
    const url = new URL(path, origin).toString();
    lines.push(`  <url><loc>${url}</loc></url>`);
  }
  lines.push(`</urlset>`);
  return lines.join("\n");
}

const EMPTY_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const host = request.headers.get("host") ?? "";
        const slug = resolveSlugFromHost(host);
        if (!slug) {
          return new Response(EMPTY_SITEMAP, {
            status: 200,
            headers: { "content-type": "application/xml; charset=utf-8" },
          });
        }
        const project = await loadProjectBySlug(slug);
        if (!project) {
          return new Response(EMPTY_SITEMAP, {
            status: 200,
            headers: { "content-type": "application/xml; charset=utf-8" },
          });
        }
        const paths = project.schema.pages.map((p) => p.path);
        const xml = buildSitemapXml(host, paths);
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            // Hour cache — the next publish/rollback will swap KV
            // contents, but Google takes longer than an hour anyway.
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
