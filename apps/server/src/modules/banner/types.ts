import type { bannerGroups, banners } from "../../schema/banner";
import type { LinkAction } from "../link/types";

export type BannerGroup = typeof bannerGroups.$inferSelect;
export type Banner = typeof banners.$inferSelect;

/** Not a banner field — only carried in API responses for caller convenience. */
export type { LinkAction };

export const BANNER_TARGET_TYPES = ["broadcast", "multicast"] as const;
export type BannerTargetType = (typeof BANNER_TARGET_TYPES)[number];

export const BANNER_LAYOUTS = ["carousel", "single", "grid"] as const;
export type BannerLayout = (typeof BANNER_LAYOUTS)[number];

/** Hard upper bound for a single multicast recipient list. */
export const BANNER_MULTICAST_MAX = 5000;

/**
 * Banner as rendered for an end user — the same columns as `Banner` minus
 * admin-only multicast bookkeeping, plus the resolved visibility state.
 * We strip `targetUserIds` / `targetType` / `isActive` / `visibleFrom` /
 * `visibleUntil` from client payloads to avoid leaking operator config.
 */
export type ClientBanner = {
  id: string;
  title: string;
  imageUrlMobile: string;
  imageUrlDesktop: string;
  altText: string | null;
  linkAction: LinkAction;
  sortOrder: number;
};

export type ClientBannerGroup = {
  id: string;
  alias: string;
  name: string;
  description: string | null;
  layout: BannerLayout;
  intervalMs: number;
  banners: ClientBanner[];
};
