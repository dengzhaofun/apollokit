import { z } from "@hono/zod-openapi"

/**
 * routePath shape — must look like an absolute path with safe URL
 * characters. We deliberately do NOT validate against an enum of known
 * routes: the admin's `NavRoute` union is the source of truth for what
 * actually renders, and stale `routePath` rows are silently skipped at
 * render time. Keeping a parallel server-side allow-list would just
 * drift.
 */
const RoutePathSchema = z
  .string()
  .min(2)
  .max(200)
  .regex(/^\/[a-zA-Z0-9\-/_]*$/, {
    message:
      "routePath must start with '/' and contain only [a-zA-Z0-9-/_]",
  })
  .openapi({
    description: "Sidebar nav route to favorite, e.g. '/shop/categories'.",
    example: "/shop/categories",
  })

export const CreateFavoriteSchema = z
  .object({
    routePath: RoutePathSchema,
  })
  .openapi("NavigationFavoriteCreate")

export type CreateFavoriteInput = z.input<typeof CreateFavoriteSchema>

export const RoutePathQuerySchema = z.object({
  routePath: RoutePathSchema.openapi({
    param: { name: "routePath", in: "query" },
    description: "Route path to remove, e.g. '/shop/categories'.",
  }),
})

export const FavoriteResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    userId: z.string(),
    routePath: z.string(),
    sortOrder: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("NavigationFavorite")

export const FavoriteListResponseSchema = z
  .object({
    items: z.array(FavoriteResponseSchema),
  })
  .openapi("NavigationFavoriteList")
