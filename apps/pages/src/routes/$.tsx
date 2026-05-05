import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PageRenderer } from "@repo/page-blocks/registry";

import { NotFoundStub } from "../lib/not-found";
import { resolveRequestPage, type PageResolution } from "../lib/page-loader";

/**
 * Server-only resolver for any non-root path. Handles two URL shapes:
 *
 *   - subdomain mode: `<slug>.pages.apollokit.dev/<page-path>` →
 *     splatPath is `/<page-path>`, slug comes from host.
 *   - path mode: `apollokit-pages.<acct>.workers.dev/<slug>/<page-path>`
 *     → splatPath is `/<slug>/<page-path>`, slug comes from path's
 *     first segment, page-path is what's left.
 *
 * `resolveRequestPage` handles the disambiguation; this route just
 * forwards.
 */
const resolveSplatPage = createServerFn({ method: "GET" })
  .inputValidator((data: { pathname: string }) => data)
  .handler(async ({ data }): Promise<PageResolution> => {
    const req = getRequest();
    let env: Record<string, unknown> = {};
    try {
      const cf = (await import("cloudflare:workers")) as unknown as {
        env: Record<string, unknown>;
      };
      env = cf.env;
    } catch {
      env = {};
    }
    return resolveRequestPage(req, data.pathname, {
      KV: env.KV as never,
      API: env.API as never,
      PAGES_BASE_DOMAIN: (env.PAGES_BASE_DOMAIN as string | undefined) ?? "pages.apollokit.dev",
    });
  });

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const splat = params._splat ?? "";
    return resolveSplatPage({ data: { pathname: `/${splat}` } });
  },
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.notFound) {
      return { meta: [{ title: "Page not found" }] };
    }
    const { schema, page } = loaderData;
    const meta: Array<Record<string, string>> = [{ title: page.title }];
    if (page.seo?.description) {
      meta.push({ name: "description", content: page.seo.description });
    }
    const og = page.seo?.ogImage ?? schema.seo?.defaultOgImage;
    if (og) meta.push({ property: "og:image", content: og });
    return { meta };
  },
  component: SplatPage,
});

function SplatPage() {
  const data = Route.useLoaderData();
  if (data.notFound) {
    return (
      <NotFoundStub
        reason={data.reason}
        slug={data.slug}
        pathname={data.pathname}
      />
    );
  }
  return <PageRenderer schema={data.schema} pageId={data.page.id} />;
}
