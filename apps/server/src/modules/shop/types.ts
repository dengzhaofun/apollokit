import type {
  shopCategories,
  shopGrowthStageClaims,
  shopGrowthStages,
  shopProducts,
  shopTags,
  shopUserPurchaseStates,
} from "../../schema/shop";
import type { ItemEntry } from "../item/types";

export type ShopCategory = typeof shopCategories.$inferSelect;
export type ShopTag = typeof shopTags.$inferSelect;
export type ShopProduct = typeof shopProducts.$inferSelect;
export type ShopGrowthStage = typeof shopGrowthStages.$inferSelect;
export type ShopUserPurchaseState = typeof shopUserPurchaseStates.$inferSelect;
export type ShopGrowthStageClaim = typeof shopGrowthStageClaims.$inferSelect;

/**
 * The four supported product availability modes. Exactly one of these
 * determines which group of time-window columns on `shop_products` is
 * allowed to be non-null — validator enforces this at the API boundary.
 */
export type TimeWindowType = "none" | "absolute" | "relative" | "cyclic";

/** Anchor for `timeWindowType='relative'` eligibility calculations. */
export type EligibilityAnchor = "user_created" | "first_purchase";

/** Reset cadence for `timeWindowType='cyclic'` products. */
export type RefreshCycle = "daily" | "weekly" | "monthly";

export type ProductType = "regular" | "growth_pack";

/** Growth-stage trigger kinds. */
export type GrowthTriggerType =
  | "accumulated_cost"
  | "accumulated_payment"
  | "custom_metric"
  | "manual";

/**
 * Category tree node — a `ShopCategory` with an attached `children` array.
 * Used by `listCategoryTree` to return a hydrated tree in one round trip.
 */
export type ShopCategoryTreeNode = ShopCategory & {
  children: ShopCategoryTreeNode[];
};

/** Result of a successful `purchase` call. */
export type PurchaseResult = {
  success: true;
  purchaseId: string;
  productId: string;
  productType: ProductType;
  costItems: ItemEntry[];
  /** Empty for `growth_pack` — rewards come from stage claims. */
  rewardItems: ItemEntry[];
};

/** Result of a successful `claimGrowthStage` call. */
export type ClaimStageResult = {
  success: true;
  claimId: string;
  stageId: string;
  productId: string;
  rewardItems: ItemEntry[];
};

/**
 * Per-product eligibility snapshot for an end user. Returned by
 * `listUserProducts` so a client can render locked/available/expired
 * badges without re-deriving the logic.
 */
export type UserProductView = ShopProduct & {
  eligibility: {
    status: "available" | "not_started" | "expired" | "out_of_stock" | "user_limit" | "cycle_limit";
    /** When status='cycle_limit', the next reset time. */
    resetsAt?: Date | null;
    /** When the relative-window product expires for this user. */
    availableUntil?: Date | null;
  };
  userPurchaseState: ShopUserPurchaseState | null;
  tags: ShopTag[];
};
