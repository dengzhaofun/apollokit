import type { PageNode, PageProjectSchema } from "@repo/page-blocks/schema";

import {
  loadProjectBySlug,
  resolveSlugFromHost,
  resolveSlugFromPath,
} from "./load-project";

/**
 * Outcome of resolving a request URL into a renderable page.
 *
 * Two slug-resolution modes coexist:
 *   - **Subdomain**: `<slug>.pages.apollokit.dev/<page-path>` (gated
 *     on Advanced Certificate Manager being configured for the zone)
 *   - **Path**: `<host>/<slug>/<page-path>` — works on the free
 *     `apollokit-pages.<account>.workers.dev` host without ACM, and
 *     also when the operator wants to reach a specific project on the
 *     subdomain root by URL.
 *
 * The function tries subdomain first, falls back to path. That
 * ordering is what makes the eventual ACM upgrade backward
 * compatible: once `<slug>.pages.apollokit.dev` works, host
 * resolution catches it and the path-mode fallback becomes dormant
 * — without any code change.
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

interface ResolveEnv {
  KV?: KVNamespace;
  API?: { fetch: (req: Request) => Promise<Response> };
  PAGES_BASE_DOMAIN?: string;
}

/**
 * Resolve the request URL → published page schema + the matching page.
 *
 * `splatPath` is the splat from TanStack Router (`/foo/bar` flavoured
 * — leading slash). For the index route `/` pass `"/"`.
 */
export async function resolveRequestPage(
  request: Request,
  splatPath: string,
  env: ResolveEnv = {},
): Promise<PageResolution> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const baseDomain = env.PAGES_BASE_DOMAIN;

  // 1) Subdomain mode: host like `<slug>.pages.apollokit.dev`
  const subdomainSlug = resolveSlugFromHost(host, baseDomain);
  if (subdomainSlug) {
    const project = await loadProjectBySlug(subdomainSlug, env);
    if (!project) {
      return {
        notFound: true,
        reason: "unknown_slug",
        slug: subdomainSlug,
        pathname: splatPath,
      };
    }
    const page = matchPage(project.schema, splatPath);
    if (!page) {
      return {
        notFound: true,
        reason: "unknown_page",
        slug: subdomainSlug,
        pathname: splatPath,
      };
    }
    return {
      notFound: false,
      slug: subdomainSlug,
      schema: project.schema,
      page,
      versionId: project.versionId,
    };
  }

  // 2) Path mode: first segment of splatPath is the slug
  const pathResolution = resolveSlugFromPath(splatPath);
  if (pathResolution) {
    const project = await loadProjectBySlug(pathResolution.slug, env);
    if (!project) {
      return {
        notFound: true,
        reason: "unknown_slug",
        slug: pathResolution.slug,
        pathname: splatPath,
      };
    }
    const page = matchPage(project.schema, pathResolution.pagePath);
    if (!page) {
      return {
        notFound: true,
        reason: "unknown_page",
        slug: pathResolution.slug,
        pathname: pathResolution.pagePath,
      };
    }
    return {
      notFound: false,
      slug: pathResolution.slug,
      schema: project.schema,
      page,
      versionId: project.versionId,
    };
  }

  // Neither mode matched — caller renders an apex landing or 404.
  return {
    notFound: true,
    reason: "unknown_host",
    slug: null,
    pathname: splatPath,
  };
}

/**
 * Match a page within the schema by its `path`. Falls back to
 * `defaultPageId` for the project root (`/`).
 */
function matchPage(
  schema: PageProjectSchema,
  pathname: string,
): PageNode | undefined {
  const normalised = pathname === "" || pathname === "/" ? "/" : pathname;
  if (normalised === "/") {
    return schema.pages.find((p) => p.id === schema.defaultPageId);
  }
  return schema.pages.find((p) => p.path === normalised);
}
