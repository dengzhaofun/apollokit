import type { PageNode, PageProjectSchema } from "@repo/page-blocks/schema";

import { loadProjectBySlug, resolveSlugFromHost } from "./load-project";

/**
 * Outcome of resolving a request URL into a renderable page.
 *
 * `notFound` discriminator covers three reasons the worker has nothing
 * to render:
 *   - `unknown_host`: host header doesn't fit `<slug>.<base>` shape
 *   - `unknown_slug`: slug exists in URL but no published project
 *   - `unknown_page`: project found, but the requested path doesn't
 *     match any of its `PageNode.path`s
 */
export type PageResolution =
  | {
      notFound: false;
      slug: string;
      schema: PageProjectSchema;
      page: PageNode;
      versionId: string;
    }
  | {
      notFound: true;
      reason: "unknown_host" | "unknown_slug" | "unknown_page";
      slug: string | null;
      pathname: string;
    };

/**
 * Resolve the request URL → published page schema + the matching page
 * within it. Used by every public route (catch-all `index.tsx` + `$.tsx`).
 *
 * `request.url` is the URL TanStack Router gives us at SSR time —
 * already includes the host header.
 *
 * The bindings env (`KV` / `API`) is wired in PR 4/5 — for now we hand
 * an empty object to `loadProjectBySlug` and only the `demo` slug
 * resolves.
 */
export async function resolveRequestPage(
  request: Request,
  pathname: string,
  baseDomain?: string,
): Promise<PageResolution> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const slug = resolveSlugFromHost(host, baseDomain);
  if (!slug) {
    return { notFound: true, reason: "unknown_host", slug: null, pathname };
  }

  const project = await loadProjectBySlug(slug);
  if (!project) {
    return { notFound: true, reason: "unknown_slug", slug, pathname };
  }

  // Match path. Fall back to defaultPageId for the root (`/`) path so
  // operators don't have to give the home page the literal path `/`
  // (some prefer `/home`).
  const normalised = pathname === "" || pathname === "/" ? "/" : pathname;
  let page: PageNode | undefined;
  if (normalised === "/") {
    page = project.schema.pages.find(
      (p) => p.id === project.schema.defaultPageId,
    );
  } else {
    page = project.schema.pages.find((p) => p.path === normalised);
  }

  if (!page) {
    return { notFound: true, reason: "unknown_page", slug, pathname };
  }

  return {
    notFound: false,
    slug,
    schema: project.schema,
    page,
    versionId: project.versionId,
  };
}
