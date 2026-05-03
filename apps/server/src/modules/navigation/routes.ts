/**
 * Admin-facing HTTP routes for the navigation module.
 *
 * Covers per-user, per-org sidebar nav favorites. Authenticated via
 * the standard admin auth (`requireAdminOrApiKey`) — but NOT
 * `requirePermissionByMethod`: every project member should be able to manage
 * their own favorites regardless of role.
 *
 * Favorites are keyed by `(activeTeamId, c.var.user.id)`. Admin
 * API keys (which have `c.var.user === null`) are explicitly rejected
 * via `NavigationApiKeyNotSupported` — they're service identities and
 * shouldn't impersonate a person's personal preferences.
 */

import { createAdminRoute, createAdminRouter } from "../../lib/openapi"
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response"
import { getOrgId } from "../../lib/route-context";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key"
import { NavigationApiKeyNotSupported } from "./errors"
import { navigationService } from "./index"
import type { NavigationFavorite } from "./types"
import {
  CreateFavoriteSchema,
  FavoriteListResponseSchema,
  FavoriteResponseSchema,
  RoutePathQuerySchema,
} from "./validators"

const TAG = "Navigation"

function serialize(row: NavigationFavorite) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    routePath: row.routePath,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function requireSessionUserId(userId: string | undefined): string {
  if (!userId) throw new NavigationApiKeyNotSupported()
  return userId
}

export const navigationRouter = createAdminRouter()

navigationRouter.use("*", requireAdminOrApiKey)

navigationRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/favorites",
    tags: [TAG],
    summary: "List the current user's pinned nav routes for this project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FavoriteListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const userId = requireSessionUserId(c.var.user?.id)
    const orgId = getOrgId(c)
    const rows = await navigationService.list(orgId, userId)
    return c.json(ok({ items: rows.map(serialize) }), 200)
  },
)

navigationRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/favorites",
    tags: [TAG],
    summary: "Pin a nav route as a favorite",
    request: {
      body: {
        content: { "application/json": { schema: CreateFavoriteSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(FavoriteResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const userId = requireSessionUserId(c.var.user?.id)
    const orgId = getOrgId(c)
    const { routePath } = c.req.valid("json")
    const row = await navigationService.add(orgId, userId, routePath)
    return c.json(ok(serialize(row)), 201)
  },
)

navigationRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/favorites",
    tags: [TAG],
    summary: "Unpin a nav route",
    request: { query: RoutePathQuerySchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const userId = requireSessionUserId(c.var.user?.id)
    const orgId = getOrgId(c)
    const { routePath } = c.req.valid("query")
    await navigationService.remove(orgId, userId, routePath)
    return c.json(ok(null), 200)
  },
)
