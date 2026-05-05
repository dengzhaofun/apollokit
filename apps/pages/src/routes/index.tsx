import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PageRenderer } from "@repo/page-blocks/registry";

import { NotFoundStub } from "../lib/not-found";
import { resolveRequestPage, type PageResolution } from "../lib/page-loader";

/**
 * Server-only resolver for the apex / root path.
 *
 * Two cases produce a real render:
 *   - Subdomain mode: host is `<slug>.pages.apollokit.dev` and the
 *     slug exists → render that project's defaultPageId. (Currently
 *     gated on ACM being configured.)
 *   - Path mode: there isn't a slug in the URL by definition (we ARE
 *     at the root), so this falls through to the apex landing stub.
 */
const resolveRootPage = createServerFn({ method: "GET" }).handler(
  async (): Promise<PageResolution> => {
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
    return resolveRequestPage(req, "/", {
      KV: env.KV as never,
      API: env.API as never,
      PAGES_BASE_DOMAIN: (env.PAGES_BASE_DOMAIN as string | undefined) ?? "pages.apollokit.dev",
    });
  },
);

export const Route = createFileRoute("/")({
  loader: async () => resolveRootPage(),
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.notFound) {
      return { meta: [{ title: "apollokit pages" }] };
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
    // Apex landing: the root of `apollokit-pages.<account>.workers.dev`
    // (or the subdomain apex `pages.apollokit.dev`) doesn't render any
    // project — there is no slug. Show a minimal explanatory stub
    // rather than a generic 404 so an operator who lands here from a
    // typo'd URL gets context.
    if (data.reason === "unknown_host") {
      return <ApexLanding />;
    }
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

function ApexLanding() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-100">
      <h1 className="text-2xl font-semibold">apollokit pages</h1>
      <p className="max-w-md text-sm text-zinc-400">
        This is the runtime that hosts AI-built landing pages. To view a
        specific page, append the project slug to the URL.
      </p>
      <code className="rounded bg-zinc-800 px-3 py-1 text-xs">
        /your-project-slug
      </code>
    </main>
  );
}
