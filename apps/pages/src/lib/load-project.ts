import type { PageProjectSchema } from "@repo/page-blocks/schema";

import { DEMO_PROJECT_FIXTURE } from "./fixtures";

/**
 * Result of resolving a host (or explicit slug) to a published page
 * project. `null` means the slug doesn't exist or has no published
 * version yet — caller renders a 404 stub.
 *
 * PR 3 only ever returns the demo fixture or null. PR 4/5 wires
 * real data loading via the API service binding + KV cache.
 */
export interface LoadedProject {
  slug: string;
  schema: PageProjectSchema;
  versionId: string;
  /** Whether the schema came from KV (vs a fresh DB fetch). */
  fromCache: boolean;
}

const PAGES_BASE_DOMAIN_DEFAULT = "pages.apollokit.dev";

/**
 * Extract the project slug from a host header.
 *
 * Production: `<slug>.pages.apollokit.dev` → `<slug>`.
 * Local dev: `<slug>.localhost:3001` or `<slug>.lvh.me:3001` → `<slug>`.
 *   (Chrome accepts cookies on `*.localhost`, which is enough for
 *    cross-subdomain dev. Set `127.0.0.1 demo.localhost` in /etc/hosts
 *    if your platform doesn't auto-resolve it.)
 *
 * Apex / unknown hosts return null — those should hit a marketing /
 * landing target managed elsewhere, not pages worker output.
 */
export function resolveSlugFromHost(
  host: string,
  baseDomain: string = PAGES_BASE_DOMAIN_DEFAULT,
): string | null {
  const lower = host.toLowerCase();
  // Strip port for dev (e.g. "demo.localhost:3001").
  const hostNoPort = lower.split(":")[0] ?? "";

  // Production wildcard.
  const prodSuffix = `.${baseDomain}`;
  if (hostNoPort.endsWith(prodSuffix)) {
    const slug = hostNoPort.slice(0, -prodSuffix.length);
    return slug || null;
  }

  // Local dev — `<slug>.localhost`.
  if (hostNoPort.endsWith(".localhost")) {
    const slug = hostNoPort.slice(0, -".localhost".length);
    return slug || null;
  }

  // Local dev — `<slug>.lvh.me` (a public DNS that resolves all
  // subdomains to 127.0.0.1; saves editing /etc/hosts).
  if (hostNoPort.endsWith(".lvh.me")) {
    const slug = hostNoPort.slice(0, -".lvh.me".length);
    return slug || null;
  }

  return null;
}

/**
 * Load a project by slug. PR 3: fixture only — `demo` returns the
 * canned schema, anything else returns null.
 *
 * The signature already accepts the bindings env so PR 4 just needs to
 * fill in the body — no caller changes.
 */
export async function loadProjectBySlug(
  slug: string,
  _env: { KV?: KVNamespace; API?: { fetch: typeof fetch } } = {},
): Promise<LoadedProject | null> {
  if (slug === "demo") {
    return {
      slug,
      schema: DEMO_PROJECT_FIXTURE,
      versionId: "fixture-v1",
      fromCache: false,
    };
  }
  return null;
}
