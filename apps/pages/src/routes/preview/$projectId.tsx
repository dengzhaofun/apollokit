import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageRenderer } from "@repo/page-blocks/registry";
import type { PageProjectSchema } from "@repo/page-blocks/schema";

import { DEMO_PROJECT_FIXTURE } from "../../lib/fixtures";
import {
  PreviewTokenInvalid,
  verifyPreviewToken,
} from "../../lib/preview-token";

/**
 * Server-only resolver for the preview signing key. createServerFn
 * keeps the `cloudflare:workers` import out of the client bundle —
 * Rollup tree-shakes server-only function bodies on the browser
 * compile target.
 */
const resolveSigningKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    try {
      const { env } = (await import("cloudflare:workers")) as {
        env: { PAGES_PREVIEW_SECRET?: string; BETTER_AUTH_SECRET?: string };
      };
      // PR 3 falls back to BETTER_AUTH_SECRET (the apps/server module
      // signs with the same secret in this PR — see plan §5). PR 7
      // splits into a dedicated PAGES_PREVIEW_SECRET.
      return env.PAGES_PREVIEW_SECRET ?? env.BETTER_AUTH_SECRET ?? null;
    } catch {
      return null;
    }
  },
);

// v / t are optional at the search-validation layer so that the route
// matches even when the operator hits the URL bare. The loader checks
// for missing values and returns an explicit "invalid token" view —
// otherwise the request would fall through to the splat catch-all and
// look like a generic "page not found".
const PreviewSearchSchema = z.object({
  v: z.string().min(1).optional(),
  t: z.string().min(1).optional(),
  p: z.string().optional(),
});

type PreviewLoaderResult =
  | {
      ok: true;
      schema: PageProjectSchema;
      pageId: string;
      versionId: string;
      projectId: string;
    }
  | { ok: false; reason: string };

/**
 * Draft preview route. Used by the admin dashboard's right-pane iframe
 * (see plan §6) to render an unpublished version of a project. Bypasses
 * subdomain slug resolution — the admin server signs a short-lived
 * JWT, the iframe loads
 * `https://pages.apollokit.dev/__preview/<projectId>?v=<versionId>&t=<jwt>&p=<pageId>`,
 * and this route verifies the token before rendering.
 *
 * PR 3 still uses fixtures: regardless of `versionId`, we render the
 * demo project schema. The token-verification path is wired so PR 7
 * (admin UI) can begin signing tokens against this endpoint without
 * waiting for real data loading. PR 4/5 replaces the fixture lookup
 * with a real DB / KV fetch.
 */
export const Route = createFileRoute("/preview/$projectId")({
  validateSearch: PreviewSearchSchema,
  loader: async ({ params, location }): Promise<PreviewLoaderResult> => {
    const search = location.search as z.infer<typeof PreviewSearchSchema>;
    const projectId = params.projectId;

    if (!search.t || !search.v) {
      return { ok: false, reason: "missing preview token" };
    }

    const signingKey = await resolveSigningKey();
    if (!signingKey) {
      return { ok: false, reason: "preview signing key not configured" };
    }

    try {
      const payload = await verifyPreviewToken(signingKey, search.t, projectId);
      // PR 3 fixture: always show the demo schema, but tag the view
      // with the verified versionId so reviewers can confirm the JWT
      // round-trip in DevTools. PR 4/5 fetches the actual version.
      const schema: PageProjectSchema = DEMO_PROJECT_FIXTURE;
      const requestedPageId = search.p ?? schema.defaultPageId;
      const exists = schema.pages.some((pg) => pg.id === requestedPageId);
      const pageId = exists ? requestedPageId : schema.defaultPageId;
      return {
        ok: true,
        schema,
        pageId,
        versionId: payload.versionId,
        projectId,
      };
    } catch (err) {
      const reason =
        err instanceof PreviewTokenInvalid
          ? err.reason
          : "unexpected error verifying token";
      return { ok: false, reason };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.ok
          ? `Preview · ${loaderData.versionId}`
          : "Preview · invalid token",
      },
      // Previews must NEVER be indexed.
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const data = Route.useLoaderData();
  if (!data.ok) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-zinc-100"
        data-preview-error="invalid"
      >
        <h1 className="text-2xl font-semibold">Preview unavailable</h1>
        <p className="max-w-md text-sm text-zinc-400">{data.reason}</p>
      </main>
    );
  }
  return (
    <>
      <PreviewBanner versionId={data.versionId} projectId={data.projectId} />
      <PageRenderer schema={data.schema} pageId={data.pageId} />
    </>
  );
}

function PreviewBanner(props: { versionId: string; projectId: string }) {
  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-medium text-amber-950"
      role="status"
    >
      <span>PREVIEW</span>
      <span className="font-mono opacity-80">version {props.versionId}</span>
      <span className="opacity-60">·</span>
      <span className="font-mono opacity-80">project {props.projectId}</span>
    </div>
  );
}
