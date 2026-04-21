import type { euUser } from "../../schema/end-user-auth";

export type EndUser = typeof euUser.$inferSelect;

/** Result of `POST /api/end-user/sync`. */
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
   * was brought in via POST /api/end-user/sync or mixed-in later.
   */
  origin: "managed" | "synced";
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListFilter = {
  search?: string;
  origin?: "managed" | "synced";
  disabled?: boolean;
  limit?: number;
  offset?: number;
};

export type ListResult = {
  items: EndUserView[];
  total: number;
};

export type UpdateEndUserInput = {
  name?: string;
  image?: string | null;
  emailVerified?: boolean;
};
