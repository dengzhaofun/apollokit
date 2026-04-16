/**
 * Admin-facing HTTP routes for the collection module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_). All handlers resolve the
 * organization from `c.var.session!.activeOrganizationId!`.
 *
 * Client-facing routes (player progress, claim, sync) live in
 * `client-routes.ts`.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import { collectionService } from "./index";
import { ModuleError } from "./errors";
import {
  AlbumIdParamSchema,
  AlbumKeyParamSchema,
  AlbumListResponseSchema,
  AlbumResponseSchema,
  BulkCreateEntriesSchema,
  CreateAlbumSchema,
  CreateEntrySchema,
  CreateGroupSchema,
  CreateMilestoneSchema,
  EntryIdParamSchema,
  EntryListResponseSchema,
  EntryResponseSchema,
  ErrorResponseSchema,
  GroupIdParamSchema,
  GroupListResponseSchema,
  GroupResponseSchema,
  MilestoneIdParamSchema,
  MilestoneListResponseSchema,
  MilestoneResponseSchema,
  RescanBodySchema,
  StatsResponseSchema,
  SyncResponseSchema,
  UpdateAlbumSchema,
  UpdateEntrySchema,
  UpdateGroupSchema,
  UpdateMilestoneSchema,
} from "./validators";

const TAG = "Collection";
const TAG_GROUP = "Collection Groups";
const TAG_ENTRY = "Collection Entries";
const TAG_MILESTONE = "Collection Milestones";
const TAG_OPS = "Collection Ops";

// ─── Serializers ─────────────────────────────────────────────────

function serializeAlbum(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  coverImage: string | null;
  icon: string | null;
  scope: string;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    coverImage: row.coverImage,
    icon: row.icon,
    scope: row.scope,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeGroup(row: {
  id: string;
  albumId: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    albumId: row.albumId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEntry(row: {
  id: string;
  albumId: string;
  groupId: string | null;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  image: string | null;
  rarity: string | null;
  sortOrder: number;
  hiddenUntilUnlocked: boolean;
  triggerType: string;
  triggerItemDefinitionId: string | null;
  triggerQuantity: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    albumId: row.albumId,
    groupId: row.groupId,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    image: row.image,
    rarity: row.rarity,
    sortOrder: row.sortOrder,
    hiddenUntilUnlocked: row.hiddenUntilUnlocked,
    triggerType: row.triggerType,
    triggerItemDefinitionId: row.triggerItemDefinitionId,
    triggerQuantity: row.triggerQuantity,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMilestone(row: {
  id: string;
  organizationId: string;
  albumId: string;
  scope: string;
  groupId: string | null;
  entryId: string | null;
  threshold: number;
  label: string | null;
  rewardItems: RewardEntry[];
  autoClaim: boolean;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    albumId: row.albumId,
    scope: row.scope,
    groupId: row.groupId,
    entryId: row.entryId,
    threshold: row.threshold,
    label: row.label,
    rewardItems: row.rewardItems,
    autoClaim: row.autoClaim,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Router scaffold ─────────────────────────────────────────────

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const collectionRouter = new OpenAPIHono<HonoEnv>();

collectionRouter.use("*", requireAdminOrApiKey);

collectionRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

// ─── Albums ──────────────────────────────────────────────────────

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums",
    tags: [TAG],
    summary: "Create a collection album",
    request: {
      body: { content: { "application/json": { schema: CreateAlbumSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: AlbumResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await collectionService.createAlbum(orgId, c.req.valid("json"));
    return c.json(serializeAlbum(row), 201);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums",
    tags: [TAG],
    summary: "List collection albums",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AlbumListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await collectionService.listAlbums(orgId);
    return c.json({ items: rows.map(serializeAlbum) }, 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}",
    tags: [TAG],
    summary: "Fetch an album by id or alias",
    request: { params: AlbumKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AlbumResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await collectionService.getAlbum(orgId, key);
    return c.json(serializeAlbum(row), 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "patch",
    path: "/albums/{id}",
    tags: [TAG],
    summary: "Update an album",
    request: {
      params: AlbumIdParamSchema,
      body: { content: { "application/json": { schema: UpdateAlbumSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AlbumResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await collectionService.updateAlbum(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeAlbum(row), 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "delete",
    path: "/albums/{id}",
    tags: [TAG],
    summary: "Delete an album (cascades to groups, entries, milestones, user state)",
    request: { params: AlbumIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await collectionService.deleteAlbum(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Groups ──────────────────────────────────────────────────────

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/groups",
    tags: [TAG_GROUP],
    summary: "Create a group under an album",
    request: {
      params: AlbumKeyParamSchema,
      body: { content: { "application/json": { schema: CreateGroupSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: GroupResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await collectionService.createGroup(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(serializeGroup(row), 201);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}/groups",
    tags: [TAG_GROUP],
    summary: "List groups under an album",
    request: { params: AlbumKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GroupListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await collectionService.listGroups(orgId, key);
    return c.json({ items: rows.map(serializeGroup) }, 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{id}",
    tags: [TAG_GROUP],
    summary: "Update a group",
    request: {
      params: GroupIdParamSchema,
      body: { content: { "application/json": { schema: UpdateGroupSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GroupResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await collectionService.updateGroup(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeGroup(row), 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "delete",
    path: "/groups/{id}",
    tags: [TAG_GROUP],
    summary: "Delete a group (entries have their groupId set to null)",
    request: { params: GroupIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await collectionService.deleteGroup(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Entries ─────────────────────────────────────────────────────

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/entries",
    tags: [TAG_ENTRY],
    summary: "Create an entry under an album",
    request: {
      params: AlbumKeyParamSchema,
      body: { content: { "application/json": { schema: CreateEntrySchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: EntryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await collectionService.createEntry(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(serializeEntry(row), 201);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/entries:bulk",
    tags: [TAG_ENTRY],
    summary: "Bulk-create entries under an album",
    request: {
      params: AlbumKeyParamSchema,
      body: {
        content: { "application/json": { schema: BulkCreateEntriesSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: EntryListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const rows = await collectionService.bulkCreateEntries(
      orgId,
      key,
      body.entries,
    );
    return c.json({ items: rows.map(serializeEntry) }, 201);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}/entries",
    tags: [TAG_ENTRY],
    summary: "List entries under an album",
    request: { params: AlbumKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: EntryListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await collectionService.listEntries(orgId, key);
    return c.json({ items: rows.map(serializeEntry) }, 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "patch",
    path: "/entries/{id}",
    tags: [TAG_ENTRY],
    summary: "Update an entry",
    request: {
      params: EntryIdParamSchema,
      body: { content: { "application/json": { schema: UpdateEntrySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: EntryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await collectionService.updateEntry(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeEntry(row), 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "delete",
    path: "/entries/{id}",
    tags: [TAG_ENTRY],
    summary: "Delete an entry (cascades to user unlocks)",
    request: { params: EntryIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await collectionService.deleteEntry(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Milestones ──────────────────────────────────────────────────

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/milestones",
    tags: [TAG_MILESTONE],
    summary: "Create a milestone under an album",
    request: {
      params: AlbumKeyParamSchema,
      body: {
        content: { "application/json": { schema: CreateMilestoneSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: MilestoneResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await collectionService.createMilestone(
      orgId,
      key,
      c.req.valid("json"),
    );
    return c.json(serializeMilestone(row), 201);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}/milestones",
    tags: [TAG_MILESTONE],
    summary: "List milestones under an album",
    request: { params: AlbumKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: MilestoneListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await collectionService.listMilestones(orgId, key);
    return c.json({ items: rows.map(serializeMilestone) }, 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "patch",
    path: "/milestones/{id}",
    tags: [TAG_MILESTONE],
    summary: "Update a milestone",
    request: {
      params: MilestoneIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateMilestoneSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: MilestoneResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await collectionService.updateMilestone(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeMilestone(row), 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "delete",
    path: "/milestones/{id}",
    tags: [TAG_MILESTONE],
    summary: "Delete a milestone",
    request: { params: MilestoneIdParamSchema },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await collectionService.deleteMilestone(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Stats + rescan (ops) ────────────────────────────────────────

collectionRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}/stats",
    tags: [TAG_OPS],
    summary: "Aggregate unlock / claim statistics for an album",
    request: { params: AlbumKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: StatsResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const stats = await collectionService.getStats(orgId, key);
    return c.json(stats, 200);
  },
);

collectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/rescan",
    tags: [TAG_OPS],
    summary: "Run a fallback unlock sync for a specific end user",
    request: {
      params: AlbumKeyParamSchema,
      body: {
        content: { "application/json": { schema: RescanBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: SyncResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const { endUserId } = c.req.valid("json");
    const entries = await collectionService.syncFromInventory({
      organizationId: orgId,
      endUserId,
      albumKey: key,
    });
    return c.json({ unlocked: entries.map((e) => e.id) }, 200);
  },
);
