/**
 * Build the public URL for a page project. Two flavours, picked at
 * Vite build time via env vars:
 *
 *   - `VITE_PAGES_BASE_DOMAIN` set → subdomain mode:
 *     `https://<slug>.<domain>/<page-path>`
 *     Requires Cloudflare Advanced Certificate Manager configured for
 *     the zone (wildcard `*.pages.apollokit.dev` cert).
 *
 *   - `VITE_PAGES_BASE_URL` set (and no base domain) → path mode:
 *     `<base-url>/<slug>/<page-path>`
 *     Free — works on the default `apollokit-pages.<account>.workers.dev`
 *     URL with the auto-issued SSL cert.
 *
 *   - Neither set → returns null. Caller should hide the public-URL
 *     UI (project card link, "open in tab" button) gracefully.
 *
 * The pages worker itself accepts both URL shapes (see
 * `apps/pages/src/lib/load-project.ts`), so flipping admin from path
 * to subdomain mode is a Vite env change + redeploy — no schema
 * migration, no operator action.
 */
export interface PagesUrlConfig {
  /** Set when ACM (or Custom Hostnames) wildcard cert is in place. */
  baseDomain?: string;
  /** Set when running on the free workers.dev URL (path mode). */
  baseUrl?: string;
}

function readEnv(): PagesUrlConfig {
  const env =
    (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env ?? {};
  return {
    baseDomain:
      typeof env.VITE_PAGES_BASE_DOMAIN === "string" &&
      env.VITE_PAGES_BASE_DOMAIN.length > 0
        ? env.VITE_PAGES_BASE_DOMAIN
        : undefined,
    baseUrl:
      typeof env.VITE_PAGES_BASE_URL === "string" &&
      env.VITE_PAGES_BASE_URL.length > 0
        ? env.VITE_PAGES_BASE_URL
        : undefined,
  };
}

export function getPagesMode(): "subdomain" | "path" | "none" {
  const { baseDomain, baseUrl } = readEnv();
  if (baseDomain) return "subdomain";
  if (baseUrl) return "path";
  return "none";
}

/**
 * Resolve the live URL of a published page project. Pass a slug
 * (always required); `pagePath` optional, defaults to project root.
 * Returns null when neither env var is configured.
 */
export function pageProjectUrl(slug: string, pagePath = "/"): string | null {
  const { baseDomain, baseUrl } = readEnv();
  const safePath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  if (baseDomain) {
    return `https://${slug}.${baseDomain}${safePath}`;
  }
  if (baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, "");
    return `${trimmed}/${slug}${safePath === "/" ? "" : safePath}`;
  }
  return null;
}

/**
 * Live URL hint shown in the create dialog as the operator types
 * the slug. Returns the same string the eventual `pageProjectUrl`
 * would produce — or a fallback "no host configured" message.
 */
export function previewSlugUrl(slug: string): string {
  const url = pageProjectUrl(slug || "your-slug", "/");
  if (url) return url;
  return "Configure VITE_PAGES_BASE_URL or VITE_PAGES_BASE_DOMAIN to show the live URL";
}

/**
 * Base URL for the pages worker preview route. Used by the workspace
 * iframe to load `/preview/<projectId>?v=&t=`. Falls back to the dev
 * pages server (`http://pages.localhost:3001`) when no env is set.
 */
export function previewBaseUrl(): string {
  const { baseDomain, baseUrl } = readEnv();
  if (baseDomain) return `https://pages.${baseDomain.replace(/^pages\./, "")}`;
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  return "http://pages.localhost:3001";
}
