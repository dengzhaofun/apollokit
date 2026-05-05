/**
 * Reserved subdomain slugs that page projects must NOT use. The slug
 * becomes `<slug>.pages.apollokit.dev`, so anything that collides with
 * existing infra subdomains, marketing pages, or expected vanity hosts
 * is forbidden.
 *
 * This list is intentionally generous — when in doubt, reserve. We can
 * always release a slug later, but reclaiming a slug from a tenant who
 * already published is painful.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Common infra
  "api",
  "www",
  "app",
  "admin",
  "platform",
  "dashboard",
  "console",
  // Auth-related
  "auth",
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "oauth",
  "sso",
  // Operational
  "status",
  "health",
  "metrics",
  "monitoring",
  "ops",
  // Brand / marketing
  "pages",
  "page",
  "docs",
  "blog",
  "support",
  "help",
  "about",
  "contact",
  "legal",
  "privacy",
  "terms",
  "press",
  "careers",
  "jobs",
  // Internal worker / preview routes
  "__preview",
  "preview",
  "internal",
  "private",
  "test",
  "staging",
  "dev",
  "demo",
  // Static asset / SEO
  "static",
  "assets",
  "cdn",
  "media",
  "images",
  "img",
  "files",
  "favicon",
  "sitemap",
  "robots",
  // Common reserved hosts on Cloudflare / general
  "cdn-cgi",
  "_acme-challenge",
  "mail",
  "email",
  "smtp",
  "imap",
  "pop",
  "ftp",
  "ns1",
  "ns2",
]);

/**
 * Slug syntactic shape — lowercase letters / digits / single hyphens,
 * 3..63 chars (DNS label limit), no leading/trailing hyphen, no
 * consecutive hyphens. The Zod schema in validators.ts re-uses this
 * regex for OpenAPI documentation.
 */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$/;

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
