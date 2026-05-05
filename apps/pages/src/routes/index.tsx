import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PageRenderer } from "@repo/page-blocks/registry";

import { NotFoundStub } from "../lib/not-found";
import { resolveRequestPage, type PageResolution } from "../lib/page-loader";

/**
 * Server-only resolver for the root path. Wrapping in `createServerFn`
 * keeps `getRequest` (a server-only API in @tanstack/react-start/server)
 * out of the client bundle. The function returns a JSON-serialisable
 * resolution result that the loader hands to the component.
 */
const resolveRootPage = createServerFn({ method: "GET" }).handler(
  async (): Promise<PageResolution> => {
    const req = getRequest();
    return resolveRequestPage(req, "/");
  },
);

/**
 * Subdomain root (`/`). Resolves the request host to a project slug,
 * loads the published schema, renders the project's defaultPageId.
 *
 * In PR 3 the only resolvable slug is `demo` (fixture). PR 4/5 wires
 * real data loading via the API service binding — this route's shape
 * doesn't change.
 */
export const Route = createFileRoute("/")({
  loader: async () => resolveRootPage(),
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
  component: HomePage,
});

function HomePage() {
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
