import type { euUser } from "../../schema/end-user-auth";

export type EndUser = typeof euUser.$inferSelect;

/** Result of `POST /api/v1/end-user/sync`. */
export type SyncResult = {
  euUserId: string;
  /**
   * Whether this row was newly inserted (`true`) or an existing row was
   * matched and merged (`false`). Useful for tenant-side idempotency
   * logging.
   */
  created: boolean;
};

/** Public end-user view — email unscoped, origin inferred. */
export type EndUserView = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  externalId: string | null;
  disabled: boolean;
  /**
   * "managed" = has a `providerId='credential'` row in eu_account (player
   * can sign in with email+password). "synced" = no credential account,
   * was brought in via POST /api/v1/end-user/sync or mixed-in later.
   */
  origin: "managed" | "synced";
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Parsed shape of `request.query` for the list endpoint, after zod
 * validation by `endUserFilters.querySchema`. The DSL produces this
 * shape; service.ts just forwards it to `endUserFilters.where(...)`.
 *
 * `q` replaces the legacy `search` param — the DSL standardises every
 * module's free-text search on `q` (see `apps/server/src/lib/pagination.ts`).
 * Admin sends `?q=...` and the SDK / fetch layer sends the same.
 */
export type ListFilter = {
  q?: string;
  origin?: "managed" | "synced";
  disabled?: boolean;
  emailVerified?: boolean;
  externalId?: string;
  createdAtGte?: Date;
  createdAtLte?: Date;
  /** Advanced AST (base64url JSON). Mutually exclusive with basic filters. */
  adv?: string;
  cursor?: string;
  limit?: number;
};

export type ListResult = {
  items: EndUserView[];
  nextCursor: string | null;
};

export type UpdateEndUserInput = {
  name?: string;
  image?: string | null;
  emailVerified?: boolean;
};
