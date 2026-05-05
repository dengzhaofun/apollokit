import type { PageProjectSchema } from "@repo/page-blocks/schema";

import { DEMO_PROJECT_FIXTURE } from "./fixtures";

/**
 * Resolved project payload returned by `loadProjectBySlug`.
 * `null` from the loader means "no published page at this slug" —
 * the caller renders a 404 stub.
 */
export interface LoadedProject {
  slug: string;
  schema: PageProjectSchema;
  versionId: string;
  fromCache: boolean;
}

const PAGES_BASE_DOMAIN_DEFAULT = "pages.apollokit.dev";
const KV_TTL_SECONDS = 60;

// ─── Slug resolution ──────────────────────────────────────────────

/**
 * Try to resolve a slug from the **host** header (subdomain mode).
 *
 * Production target: `<slug>.pages.apollokit.dev`. Currently disabled
 * because Cloudflare's universal SSL only covers 1-level wildcard
 * (`*.apollokit.dev`); 2-level wildcards (`*.pages.apollokit.dev`)
 * need Advanced Certificate Manager which we deferred. Until ACM is
 * in place, this function returns null in production and the caller
 * falls back to `resolveSlugFromPath`.
 *
 * Dev still works on `<slug>.localhost` / `<slug>.lvh.me` because
 * Chrome accepts cookies on those without a real cert.
 */
export function resolveSlugFromHost(
  host: string,
  baseDomain: string = PAGES_BASE_DOMAIN_DEFAULT,
): string | null {
  const lower = host.toLowerCase();
  const hostNoPort = lower.split(":")[0] ?? "";

  // Production wildcard subdomain (only meaningful once ACM is set up).
  const prodSuffix = `.${baseDomain}`;
  if (hostNoPort.endsWith(prodSuffix)) {
    const slug = hostNoPort.slice(0, -prodSuffix.length);
    return slug || null;
  }

  // Local dev — `<slug>.localhost` / `<slug>.lvh.me`.
  if (hostNoPort.endsWith(".localhost")) {
    const slug = hostNoPort.slice(0, -".localhost".length);
    return slug || null;
  }
  if (hostNoPort.endsWith(".lvh.me")) {
    const slug = hostNoPort.slice(0, -".lvh.me".length);
    return slug || null;
  }

  return null;
}

/**
 * Path-mode slug resolution: `<base>/<slug>/<rest>` → slug=`<slug>`,
 * pagePath=`/<rest>`. Used when host doesn't match a subdomain
 * pattern (i.e. the worker is being reached via its default
 * `apollokit-pages.<account>.workers.dev` URL).
 *
 * `pagePath` is what the renderer compares against `PageNode.path`
 * — defaults to `/` when there's nothing after the slug.
 *
 * Reserved first segments (`preview`, `__preview`, `sitemap.xml`,
 * `robots.txt`) return null so other route files take precedence.
 */
const RESERVED_PATH_PREFIXES = new Set([
  "preview",
  "__preview",
  "_preview",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "_health",
  "__health",
  "api",
]);

export function resolveSlugFromPath(
  pathname: string,
): { slug: string; pagePath: string } | null {
  const trimmed = pathname.replace(/^\/+/, "");
  if (!trimmed) return null;
  const slashIdx = trimmed.indexOf("/");
  const head = slashIdx >= 0 ? trimmed.slice(0, slashIdx) : trimmed;
  const tail = slashIdx >= 0 ? trimmed.slice(slashIdx) : "";
  if (!head || RESERVED_PATH_PREFIXES.has(head)) return null;
  // Slug shape (matches server validator): 3-63 chars, lower
  // alphanum + single hyphens, no leading/trailing/double hyphen.
  if (!/^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$/.test(head)) return null;
  return { slug: head, pagePath: tail || "/" };
}

// ─── DB-backed loader ─────────────────────────────────────────────

interface RuntimeApiBinding {
  fetch: (req: Request) => Promise<Response>;
}

interface ServerRuntimePayload {
  project: {
    id: string;
    slug: string;
    name: string;
    authMode: string;
    status: string;
    publishedVersionId: string | null;
    settings: Record<string, unknown>;
  };
  publishedVersion: {
    id: string;
    versionNumber: number;
    schema: Record<string, unknown>;
  } | null;
}

/**
 * Load a project by slug.
 *
 * Order of resolution:
 *   1. Demo fixture (`slug === "demo"`) — always wins; lets the
 *      worker render something even when the API binding / KV are
 *      misconfigured.
 *   2. KV cache (`pages:slug:<slug>`, 60s TTL).
 *   3. Service binding to apollokit-server's
 *      `/api/v1/page-runtime/by-slug/<slug>` public endpoint.
 *   4. null — page not found / not published.
 *
 * The `env` object is whatever the SSR caller can reach via
 * `cloudflare:workers`. In dev / vitest both `KV` and `API` will
 * usually be undefined; the loader degrades gracefully.
 */
export async function loadProjectBySlug(
  slug: string,
  env: { KV?: KVNamespace; API?: RuntimeApiBinding } = {},
): Promise<LoadedProject | null> {
  if (slug === "demo") {
    return {
      slug,
      schema: DEMO_PROJECT_FIXTURE,
      versionId: "fixture-v1",
      fromCache: false,
    };
  }

  // (2) KV fast-path
  const kvKey = `pages:slug:${slug}`;
  if (env.KV) {
    const cached = await env.KV.get<ServerRuntimePayload>(kvKey, "json");
    if (cached?.publishedVersion) {
      return {
        slug,
        schema: cached.publishedVersion.schema as unknown as PageProjectSchema,
        versionId: cached.publishedVersion.id,
        fromCache: true,
      };
    }
  }

  // (3) Service binding fetch
  if (!env.API) return null;

  let res: Response;
  try {
    // The path is absolute; service binding fetch ignores host.
    res = await env.API.fetch(
      new Request(
        `https://internal/api/v1/page-runtime/by-slug/${encodeURIComponent(slug)}`,
        { method: "GET" },
      ),
    );
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const envelope = (await res.json()) as {
    code: string;
    data: ServerRuntimePayload | null;
  };
  if (envelope.code !== "ok" || !envelope.data || !envelope.data.publishedVersion) {
    return null;
  }
  const payload = envelope.data;

  // (3a) Best-effort KV write. Server-side already does this on the
  // /by-slug/ route, but writing on the pages worker side too means a
  // cache hit on the pages worker's KV the next time around even when
  // the server worker's binding is in a different region.
  if (env.KV) {
    try {
      await env.KV.put(kvKey, JSON.stringify(payload), {
        expirationTtl: KV_TTL_SECONDS,
      });
    } catch {
      /* swallow — cache fill is opportunistic */
    }
  }

  return {
    slug,
    schema: payload.publishedVersion!.schema as unknown as PageProjectSchema,
    versionId: payload.publishedVersion!.id,
    fromCache: false,
  };
}
