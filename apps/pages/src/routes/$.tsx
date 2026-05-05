import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PageRenderer } from "@repo/page-blocks/registry";

import { NotFoundStub } from "../lib/not-found";
import { resolveRequestPage, type PageResolution } from "../lib/page-loader";

/**
 * Server-only resolver for non-root paths. createServerFn keeps
 * `getRequest` (server-only) out of the client bundle.
 */
const resolveSplatPage = createServerFn({ method: "GET" })
  .inputValidator((data: { pathname: string }) => data)
  .handler(async ({ data }): Promise<PageResolution> => {
    const req = getRequest();
    return resolveRequestPage(req, data.pathname);
  });

/**
 * Catch-all for non-root paths within a project subdomain.
 * `/checkin`, `/shop`, `/about`, `/foo/bar/baz` — all matched here and
 * resolved against `PageNode.path` in the project's published schema.
 *
 * Distinct from `/__preview/...` (separate file) because previews go
 * through a token-validated path that bypasses slug resolution.
 */
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
