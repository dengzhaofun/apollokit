// Types mirror the server envelope shapes in
// `apps/server/src/modules/navigation/validators.ts`. Keep in sync when
// the server schema changes — the generated SDK (PR2) will eventually
// replace this hand-typed surface.

export type NavigationFavorite = {
  id: string
  organizationId: string
  userId: string
  routePath: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type NavigationFavoriteList = {
  items: NavigationFavorite[]
}
