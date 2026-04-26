/**
 * End-user (player) types — mirror of the server-side `EndUserView`
 * contract declared in `apps/server/src/modules/end-user/types.ts`.
 * Kept hand-typed (not SDK-generated) to stay consistent with every
 * other module in this app.
 */

export type EndUserOrigin = "managed" | "synced"

export interface EndUser {
  id: string
  email: string
  name: string
  image: string | null
  emailVerified: boolean
  externalId: string | null
  disabled: boolean
  origin: EndUserOrigin
  sessionCount: number
  createdAt: string
  updatedAt: string
}

export interface EndUserListResponse {
  items: EndUser[]
  nextCursor: string | null
}

export interface ListEndUsersQuery {
  search?: string
  origin?: EndUserOrigin
  disabled?: boolean
  cursor?: string
  limit?: number
}

export interface UpdateEndUserInput {
  name?: string
  image?: string | null
  emailVerified?: boolean
}

export interface SyncEndUserInput {
  externalId?: string
  email: string
  name: string
  image?: string | null
  emailVerified?: boolean
}

export interface SyncEndUserResponse {
  euUserId: string
  created: boolean
}

export interface SignOutAllResponse {
  revoked: number
}
