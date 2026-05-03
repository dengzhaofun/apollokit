/**
 * Client-facing CMS routes.
 *
 * Mounted at `/api/client/cms`. Auth: `requireClientCredential` only —
 * a `cpk_…` API key is enough to identify the org. We deliberately skip
 * `requireClientUser` because CMS content is org-scoped, not per-end-user;
 * forcing every reader to have an end-user HMAC is friction without
 * payoff. If a future reader wants per-end-user content (paywalls,
 * A/B), wire `requireClientUser` onto the specific routes that need it.
 *
 * Surface:
 *   GET /by-alias/{typeAlias}/{entryAlias}  → single published entry
 *   GET /group/{typeAlias}/{groupKey}       → published entries in a group
 *   GET /tag/{tag}                          → published entries with this tag (cross-type)
 *   GET /list/{typeAlias}                   → all published entries of a type
 *
 * Caching: every successful response carries `Cache-Control: public,
 * max-age=60`. A workerd Cache API middleware (or a fronting CDN) is
 * the right place to materialize that — handlers stay simple. Edge
 * cache integration + invalidation on admin writes is tracked as M5.
 */

import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createClientRoute, createClientRouter } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { CmsEntryNotFound } from "./errors";
import { cmsService } from "./index";
import type { CmsEntry } from "./types";
import {
  CmsClientByAliasParamSchema,
  CmsClientEntryListSchema,
  CmsClientEntrySchema,
  CmsClientGroupParamSchema,
  CmsClientListParamSchema,
  CmsClientListQuerySchema,
  CmsClientTagParamSchema,
} from "./validators";

const TAG = "CMS (Client)";
const CACHE_TTL_SECONDS = 60;
const CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}`;

function publicEntry(row: CmsEntry) {
  return {
    typeAlias: row.typeAlias,
    alias: row.alias,
    groupKey: row.groupKey,
    tags: row.tags,
    data: row.data,
    schemaVersion: row.schemaVersion,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
  };
}

export const cmsClientRouter = createClientRouter();

cmsClientRouter.use("*", requireClientCredential);

cmsClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/by-alias/{typeAlias}/{entryAlias}",
    tags: [TAG],
    summary: "Fetch a single published CMS entry by alias",
    request: { params: CmsClientByAliasParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsClientEntrySchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const { typeAlias, entryAlias } = c.req.valid("param");
    const row = await cmsService.clientGetByAlias(orgId, typeAlias, entryAlias);
    if (!row) {
      throw new CmsEntryNotFound(`${typeAlias}/${entryAlias}`);
    }
    c.header("Cache-Control", CACHE_CONTROL);
    return c.json(ok(publicEntry(row)), 200);
  },
);

cmsClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/group/{typeAlias}/{groupKey}",
    tags: [TAG],
    summary: "List published entries within a group",
    request: {
      params: CmsClientGroupParamSchema,
      query: CmsClientListQuerySchema.pick({ limit: true, offset: true }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsClientEntryListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const { typeAlias, groupKey } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const rows = await cmsService.clientListByGroup(
      orgId,
      typeAlias,
      groupKey,
      { limit, offset },
    );
    c.header("Cache-Control", CACHE_CONTROL);
    return c.json(ok({ items: rows.map(publicEntry) }), 200);
  },
);

cmsClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/tag/{tag}",
    tags: [TAG],
    summary: "List published entries with a tag (cross-type)",
    request: {
      params: CmsClientTagParamSchema,
      query: CmsClientListQuerySchema.pick({ limit: true, offset: true }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsClientEntryListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const { tag } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const rows = await cmsService.clientListByTag(orgId, tag, {
      limit,
      offset,
    });
    c.header("Cache-Control", CACHE_CONTROL);
    return c.json(ok({ items: rows.map(publicEntry) }), 200);
  },
);

cmsClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/list/{typeAlias}",
    tags: [TAG],
    summary: "List all published entries of a type",
    request: {
      params: CmsClientListParamSchema,
      query: CmsClientListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsClientEntryListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const { typeAlias } = c.req.valid("param");
    const q = c.req.valid("query");
    const rows = await cmsService.clientListType(orgId, typeAlias, {
      groupKey: q.groupKey,
      tag: q.tag,
      limit: q.limit,
      offset: q.offset,
    });
    c.header("Cache-Control", CACHE_CONTROL);
    return c.json(ok({ items: rows.map(publicEntry) }), 200);
  },
);
