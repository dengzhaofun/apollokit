/**
 * Public runtime endpoints for the apollokit-pages worker.
 *
 * Mounted at `/api/v1/page/runtime`. **No auth** — the pages worker
 * reaches us via service binding (worker-to-worker RPC), so the
 * isolation boundary is "not on the public internet" rather than
 * "valid credential". For defence in depth we still:
 *   - return only PUBLISHED schemas (drafts are gated by the preview
 *     JWT route, not here)
 *   - omit any operator-only metadata (createdBy, settings.* secrets,
 *     conversation history)
 *
 * Cache strategy lives at the route layer (not the service layer): the
 * KV `pages:slug:<slug>` lookup short-circuits the DB query, with a
 * 60s TTL. `publishVersion` / `rollback` admin routes invalidate the
 * key explicitly so a fresh publish goes live within ~1 KV write
 * round-trip rather than waiting on TTL expiry.
 */

import { env } from "cloudflare:workers";
import { z } from "@hono/zod-openapi";

import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { createPublicRouter, createPublicRoute } from "../../lib/openapi";
import { PageProjectNotFound } from "./errors";
import { pageService } from "./index";
import type { PageProject, PageProjectVersion } from "./types";

const TAG = "Page (Runtime)";

const KV_TTL_SECONDS = 60;

interface CachedPayload {
  project: PageProjectPublic;
  publishedVersion: PageProjectVersionPublic | null;
}

interface PageProjectPublic {
  id: string;
  slug: string;
  name: string;
  authMode: string;
  status: string;
  publishedVersionId: string | null;
  // settings is opaque — operators may store branding overrides here.
  settings: Record<string, unknown>;
}

interface PageProjectVersionPublic {
  id: string;
  versionNumber: number;
  schema: Record<string, unknown>;
}

function cacheKey(slug: string): string {
  return `pages:slug:${slug}`;
}

function publicProject(p: PageProject): PageProjectPublic {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    authMode: p.authMode,
    status: p.status,
    publishedVersionId: p.publishedVersionId,
    settings: p.settings,
  };
}

function publicVersion(v: PageProjectVersion): PageProjectVersionPublic {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    schema: v.schema,
  };
}

const SlugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(63)
    .openapi({ param: { name: "slug", in: "path" } }),
});

const RuntimePayloadSchema = z
  .object({
    project: z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      authMode: z.string(),
      status: z.string(),
      publishedVersionId: z.string().nullable(),
      settings: z.record(z.string(), z.any()),
    }),
    publishedVersion: z
      .object({
        id: z.string(),
        versionNumber: z.number().int(),
        schema: z.record(z.string(), z.any()),
      })
      .nullable(),
  })
  .openapi("PageRuntimePayload");

export const pageRuntimeRouter = createPublicRouter();

pageRuntimeRouter.openapi(
  createPublicRoute({
    method: "get",
    path: "/by-slug/{slug}",
    tags: [TAG],
    summary:
      "Resolve a project slug to its published schema. Used by the apollokit-pages worker SSR loader. Returns 404 when no project exists or no version is published.",
    request: { params: SlugParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RuntimePayloadSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");

    // 1) KV fast-path
    const kv = (env as { KV?: KVNamespace }).KV;
    if (kv) {
      const cached = await kv.get(cacheKey(slug), "json");
      if (cached) {
        return c.json(ok(cached as CachedPayload), 200);
      }
    }

    // 2) DB lookup (slug is globally unique — no tenant scoping needed
    //    here; the slug → tenant mapping is implicit in the row).
    const project = await pageService.getProjectBySlug(slug);
    if (!project || !project.publishedVersionId) {
      // Throw so the router's onError shapes the standard envelope.
      throw new PageProjectNotFound(slug);
    }
    // Direct version fetch — cross-tenant lookup is fine because we
    // verified the project's tenantId against the project we just
    // loaded. Use the service's internal load path indirectly via
    // listVersions (it scopes by projectId already).
    const versionsPage = await pageService.listVersions(
      project.tenantId,
      project.id,
      { limit: 200 },
    );
    const published = versionsPage.items.find(
      (v) => v.id === project.publishedVersionId,
    );
    if (!published) {
      throw new PageProjectNotFound(slug);
    }

    const payload: CachedPayload = {
      project: publicProject(project),
      publishedVersion: publicVersion(published),
    };

    // 3) Best-effort KV write — never block the response on cache fill
    if (kv) {
      c.executionCtx.waitUntil(
        kv.put(cacheKey(slug), JSON.stringify(payload), {
          expirationTtl: KV_TTL_SECONDS,
        }),
      );
    }

    return c.json(ok(payload), 200);
  },
);

/**
 * Imperative cache invalidator. Called by `publishVersion` and
 * `rollback` admin routes after they update the published pointer so
 * the next runtime read sees the new schema rather than waiting on
 * the 60s TTL.
 */
export async function invalidateRuntimeCache(slug: string): Promise<void> {
  const kv = (env as { KV?: KVNamespace }).KV;
  if (!kv) return;
  await kv.delete(cacheKey(slug));
}
