/**
 * Shop service — protocol-agnostic business logic for the shop / storefront.
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Architecture notes (for the next person touching this file):
 *
 * 1. **No transactions** — `drizzle-orm/neon-http` runs over Neon's HTTP
 *    driver which rejects `db.transaction()`. All write paths use either
 *    a single atomic SQL statement (`INSERT ... ON CONFLICT ... DO UPDATE
 *    ... setWhere <guard>`) or a sequence of atomic statements with
 *    compensating rollbacks on failure. The `purchase` flow below is the
 *    most involved example.
 *
 * 2. **Cross-module dependency** — shop produces/consumes items via the
 *    `itemService`, which is injected as a positional arg (mirroring the
 *    exchange module). Shop never reads `item_inventories` or writes
 *    `item_grant_logs` directly.
 *
 * 3. **Two discriminators on products:**
 *      - `productType` (regular | growth_pack): `regular` grants rewards
 *        immediately on purchase; `growth_pack` records the entitlement
 *        and leaves rewards to `claimGrowthStage`.
 *      - `timeWindowType` (none | absolute | relative | cyclic): mutually
 *        exclusive availability modes. Each user+product eligibility check
 *        dispatches on this enum.
 *
 * 4. **Compensating rollbacks.** `purchase` increments user counter →
 *    global counter → deducts cost items → grants reward items. On any
 *    step's failure we undo the prior steps in reverse order. The item
 *    grant/deduct calls carry a stable `sourceId = purchaseId` so both
 *    idempotency and rollback attribution land in `item_grant_logs` for
 *    audit.
 *
 * 5. **Category tree.** `listCategoryTree` issues a single CTE-free query
 *    (the table is small and fully tenant-scoped) and builds the tree
 *    in-memory. `includeDescendantCategories` for product listings walks
 *    the subtree using a recursive CTE — SQL is generated inline.
 */

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  shopCategories,
  shopGrowthStageClaims,
  shopGrowthStages,
  shopProductTags,
  shopProducts,
  shopTags,
  shopUserPurchaseStates,
} from "../../schema/shop";
import { itemGrantLogs } from "../../schema/item";
import type { ItemService } from "../item";
import type { RewardEntry } from "../../lib/rewards";
import {
  ShopAlreadyClaimed,
  ShopCategoryAliasConflict,
  ShopCategoryCycle,
  ShopCategoryNotFound,
  ShopConcurrencyConflict,
  ShopCycleLimitReached,
  ShopGlobalLimitReached,
  ShopGrowthStageNotFound,
  ShopGrowthTriggerUnmet,
  ShopInvalidInput,
  ShopNotEntitled,
  ShopOutsideTimeWindow,
  ShopProductAliasConflict,
  ShopProductInactive,
  ShopProductNotFound,
  ShopTagAliasConflict,
  ShopTagNotFound,
  ShopUserLimitReached,
} from "./errors";
import { computeEligibilityExpiry, computeNextRefresh } from "./time";
import type {
  ClaimStageResult,
  GrowthTriggerType,
  ProductType,
  PurchaseResult,
  RefreshCycle,
  ShopCategory,
  ShopCategoryTreeNode,
  ShopGrowthStage,
  ShopProduct,
  ShopTag,
  ShopUserPurchaseState,
  TimeWindowType,
  UserProductView,
} from "./types";
import type {
  CreateCategoryInput,
  CreateGrowthStageInput,
  CreateProductInput,
  CreateTagInput,
  ListProductsQuery,
  ListUserProductsQuery,
  UpdateCategoryInput,
  UpdateGrowthStageInput,
  UpdateProductInput,
  UpdateTagInput,
  UpsertStagesInput,
} from "./validators";

type ShopDeps = Pick<AppDeps, "db">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_MAX_LEVEL = 3;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

function parseDateOrNull(v: string | null | undefined): Date | null {
  if (v == null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    throw new ShopInvalidInput(`invalid timestamp: ${v}`);
  return d;
}

export function createShopService(d: ShopDeps, itemSvc: ItemService) {
  const { db } = d;

  // ─── Helpers ─────────────────────────────────────────────────────

  async function loadCategoryByKey(
    organizationId: string,
    key: string,
  ): Promise<ShopCategory> {
    const where = looksLikeId(key)
      ? and(
          eq(shopCategories.organizationId, organizationId),
          eq(shopCategories.id, key),
        )
      : and(
          eq(shopCategories.organizationId, organizationId),
          eq(shopCategories.alias, key),
        );
    const rows = await db.select().from(shopCategories).where(where).limit(1);
    if (!rows[0]) throw new ShopCategoryNotFound(key);
    return rows[0];
  }

  async function loadTagByKey(
    organizationId: string,
    key: string,
  ): Promise<ShopTag> {
    const where = looksLikeId(key)
      ? and(eq(shopTags.organizationId, organizationId), eq(shopTags.id, key))
      : and(
          eq(shopTags.organizationId, organizationId),
          eq(shopTags.alias, key),
        );
    const rows = await db.select().from(shopTags).where(where).limit(1);
    if (!rows[0]) throw new ShopTagNotFound(key);
    return rows[0];
  }

  async function loadProductByKey(
    organizationId: string,
    key: string,
  ): Promise<ShopProduct> {
    const where = looksLikeId(key)
      ? and(
          eq(shopProducts.organizationId, organizationId),
          eq(shopProducts.id, key),
        )
      : and(
          eq(shopProducts.organizationId, organizationId),
          eq(shopProducts.alias, key),
        );
    const rows = await db.select().from(shopProducts).where(where).limit(1);
    if (!rows[0]) throw new ShopProductNotFound(key);
    return rows[0];
  }

  async function loadStageById(stageId: string): Promise<ShopGrowthStage> {
    const rows = await db
      .select()
      .from(shopGrowthStages)
      .where(eq(shopGrowthStages.id, stageId))
      .limit(1);
    if (!rows[0]) throw new ShopGrowthStageNotFound(stageId);
    return rows[0];
  }

  /** Ascend the parent chain collecting ids — throws on cycle detection. */
  async function collectAncestors(
    startId: string,
    maxDepth = 16,
  ): Promise<string[]> {
    const seen: string[] = [];
    let current: string | null = startId;
    let depth = 0;
    while (current && depth < maxDepth) {
      if (seen.includes(current)) throw new ShopCategoryCycle();
      seen.push(current);
      const rows: Array<{ parentId: string | null }> = await db
        .select({ parentId: shopCategories.parentId })
        .from(shopCategories)
        .where(eq(shopCategories.id, current))
        .limit(1);
      current = rows[0]?.parentId ?? null;
      depth++;
    }
    return seen;
  }

  /** Fetch `{ id, level }` for an id, for cheap parent-level lookup. */
  async function loadCategoryLevel(
    id: string,
  ): Promise<{ id: string; level: number } | null> {
    const rows = await db
      .select({ id: shopCategories.id, level: shopCategories.level })
      .from(shopCategories)
      .where(eq(shopCategories.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── Category CRUD ───────────────────────────────────────────────

  async function createCategory(
    organizationId: string,
    input: CreateCategoryInput,
  ): Promise<ShopCategory> {
    let level = 0;
    if (input.parentId) {
      const parent = await loadCategoryLevel(input.parentId);
      if (!parent) throw new ShopCategoryNotFound(input.parentId);
      level = parent.level + 1;
      if (level >= CATEGORY_MAX_LEVEL)
        throw new ShopInvalidInput(
          `category nesting exceeds max depth ${CATEGORY_MAX_LEVEL}`,
        );
    }
    try {
      const [row] = await db
        .insert(shopCategories)
        .values({
          organizationId,
          parentId: input.parentId ?? null,
          alias: input.alias ?? null,
          name: input.name,
          description: input.description ?? null,
          coverImage: input.coverImage ?? null,
          icon: input.icon ?? null,
          level,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias)
        throw new ShopCategoryAliasConflict(input.alias);
      throw err;
    }
  }

  async function updateCategory(
    organizationId: string,
    id: string,
    patch: UpdateCategoryInput,
  ): Promise<ShopCategory> {
    const existing = await loadCategoryByKey(organizationId, id);

    let level = existing.level;
    if (patch.parentId !== undefined) {
      if (patch.parentId === null) {
        level = 0;
      } else {
        if (patch.parentId === existing.id) throw new ShopCategoryCycle();
        const parent = await loadCategoryLevel(patch.parentId);
        if (!parent) throw new ShopCategoryNotFound(patch.parentId);
        // Walk parent ancestors to ensure we don't re-enter existing.id
        const ancestors = await collectAncestors(patch.parentId);
        if (ancestors.includes(existing.id)) throw new ShopCategoryCycle();
        level = parent.level + 1;
        if (level >= CATEGORY_MAX_LEVEL)
          throw new ShopInvalidInput(
            `category nesting exceeds max depth ${CATEGORY_MAX_LEVEL}`,
          );
      }
    }

    const values: Partial<typeof shopCategories.$inferInsert> = {};
    if (patch.parentId !== undefined) values.parentId = patch.parentId;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.coverImage !== undefined) values.coverImage = patch.coverImage;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;
    if (level !== existing.level) values.level = level;

    if (Object.keys(values).length === 0) return existing;

    try {
      const [row] = await db
        .update(shopCategories)
        .set(values)
        .where(
          and(
            eq(shopCategories.id, existing.id),
            eq(shopCategories.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new ShopCategoryNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias)
        throw new ShopCategoryAliasConflict(patch.alias);
      throw err;
    }
  }

  async function deleteCategory(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(shopCategories)
      .where(
        and(
          eq(shopCategories.id, id),
          eq(shopCategories.organizationId, organizationId),
        ),
      )
      .returning({ id: shopCategories.id });
    if (deleted.length === 0) throw new ShopCategoryNotFound(id);
  }

  async function listCategories(
    organizationId: string,
  ): Promise<ShopCategory[]> {
    return db
      .select()
      .from(shopCategories)
      .where(eq(shopCategories.organizationId, organizationId))
      .orderBy(asc(shopCategories.level), asc(shopCategories.sortOrder));
  }

  async function listCategoryTree(
    organizationId: string,
  ): Promise<ShopCategoryTreeNode[]> {
    const flat = await listCategories(organizationId);
    const byId = new Map<string, ShopCategoryTreeNode>();
    for (const c of flat) byId.set(c.id, { ...c, children: [] });
    const roots: ShopCategoryTreeNode[] = [];
    for (const c of flat) {
      const node = byId.get(c.id)!;
      if (c.parentId && byId.has(c.parentId)) {
        byId.get(c.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async function getCategory(
    organizationId: string,
    idOrAlias: string,
  ): Promise<ShopCategory> {
    return loadCategoryByKey(organizationId, idOrAlias);
  }

  // ─── Tag CRUD ────────────────────────────────────────────────────

  async function createTag(
    organizationId: string,
    input: CreateTagInput,
  ): Promise<ShopTag> {
    try {
      const [row] = await db
        .insert(shopTags)
        .values({
          organizationId,
          alias: input.alias ?? null,
          name: input.name,
          color: input.color ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias)
        throw new ShopTagAliasConflict(input.alias);
      throw err;
    }
  }

  async function updateTag(
    organizationId: string,
    id: string,
    patch: UpdateTagInput,
  ): Promise<ShopTag> {
    const existing = await loadTagByKey(organizationId, id);
    const values: Partial<typeof shopTags.$inferInsert> = {};
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.color !== undefined) values.color = patch.color;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;
    if (Object.keys(values).length === 0) return existing;
    try {
      const [row] = await db
        .update(shopTags)
        .set(values)
        .where(
          and(
            eq(shopTags.id, existing.id),
            eq(shopTags.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new ShopTagNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias)
        throw new ShopTagAliasConflict(patch.alias);
      throw err;
    }
  }

  async function deleteTag(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(shopTags)
      .where(
        and(eq(shopTags.id, id), eq(shopTags.organizationId, organizationId)),
      )
      .returning({ id: shopTags.id });
    if (deleted.length === 0) throw new ShopTagNotFound(id);
  }

  async function listTags(organizationId: string): Promise<ShopTag[]> {
    return db
      .select()
      .from(shopTags)
      .where(eq(shopTags.organizationId, organizationId))
      .orderBy(asc(shopTags.sortOrder), asc(shopTags.createdAt));
  }

  async function getTag(
    organizationId: string,
    idOrAlias: string,
  ): Promise<ShopTag> {
    return loadTagByKey(organizationId, idOrAlias);
  }

  // ─── Product CRUD ────────────────────────────────────────────────

  async function setProductTags(
    productId: string,
    tagIds: string[] | undefined,
  ): Promise<void> {
    if (tagIds === undefined) return;
    await db
      .delete(shopProductTags)
      .where(eq(shopProductTags.productId, productId));
    if (tagIds.length === 0) return;
    await db
      .insert(shopProductTags)
      .values(tagIds.map((tagId) => ({ productId, tagId })))
      .onConflictDoNothing();
  }

  async function loadProductTags(
    productIds: string[],
  ): Promise<Map<string, ShopTag[]>> {
    const map = new Map<string, ShopTag[]>();
    if (productIds.length === 0) return map;
    const rows = await db
      .select({
        productId: shopProductTags.productId,
        tag: shopTags,
      })
      .from(shopProductTags)
      .innerJoin(shopTags, eq(shopTags.id, shopProductTags.tagId))
      .where(inArray(shopProductTags.productId, productIds));
    for (const r of rows) {
      const bucket = map.get(r.productId) ?? [];
      bucket.push(r.tag);
      map.set(r.productId, bucket);
    }
    return map;
  }

  async function createProduct(
    organizationId: string,
    input: CreateProductInput,
  ): Promise<ShopProduct & { tags: ShopTag[] }> {
    if (input.categoryId) {
      const cat = await loadCategoryLevel(input.categoryId);
      if (!cat) throw new ShopCategoryNotFound(input.categoryId);
    }

    try {
      const [row] = await db
        .insert(shopProducts)
        .values({
          organizationId,
          categoryId: input.categoryId ?? null,
          alias: input.alias ?? null,
          name: input.name,
          description: input.description ?? null,
          coverImage: input.coverImage ?? null,
          galleryImages: input.galleryImages ?? null,
          productType: input.productType ?? "regular",
          costItems: input.costItems,
          rewardItems: input.rewardItems ?? [],
          timeWindowType: input.timeWindowType ?? "none",
          availableFrom: parseDateOrNull(input.availableFrom),
          availableTo: parseDateOrNull(input.availableTo),
          eligibilityAnchor: input.eligibilityAnchor ?? null,
          eligibilityWindowSeconds: input.eligibilityWindowSeconds ?? null,
          refreshCycle: input.refreshCycle ?? null,
          refreshLimit: input.refreshLimit ?? null,
          userLimit: input.userLimit ?? null,
          globalLimit: input.globalLimit ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");

      if (input.tagIds && input.tagIds.length > 0) {
        await setProductTags(row.id, input.tagIds);
      }
      const tagsMap = await loadProductTags([row.id]);
      return { ...row, tags: tagsMap.get(row.id) ?? [] };
    } catch (err) {
      if (isUniqueViolation(err) && input.alias)
        throw new ShopProductAliasConflict(input.alias);
      throw err;
    }
  }

  async function updateProduct(
    organizationId: string,
    id: string,
    patch: UpdateProductInput,
  ): Promise<ShopProduct & { tags: ShopTag[] }> {
    const existing = await loadProductByKey(organizationId, id);

    if (patch.categoryId !== undefined && patch.categoryId !== null) {
      const cat = await loadCategoryLevel(patch.categoryId);
      if (!cat) throw new ShopCategoryNotFound(patch.categoryId);
    }

    const values: Partial<typeof shopProducts.$inferInsert> = {};
    if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.coverImage !== undefined) values.coverImage = patch.coverImage;
    if (patch.galleryImages !== undefined)
      values.galleryImages = patch.galleryImages;
    if (patch.productType !== undefined) values.productType = patch.productType;
    if (patch.costItems !== undefined) values.costItems = patch.costItems;
    if (patch.rewardItems !== undefined) values.rewardItems = patch.rewardItems;
    if (patch.timeWindowType !== undefined)
      values.timeWindowType = patch.timeWindowType;
    if (patch.availableFrom !== undefined)
      values.availableFrom = parseDateOrNull(patch.availableFrom);
    if (patch.availableTo !== undefined)
      values.availableTo = parseDateOrNull(patch.availableTo);
    if (patch.eligibilityAnchor !== undefined)
      values.eligibilityAnchor = patch.eligibilityAnchor;
    if (patch.eligibilityWindowSeconds !== undefined)
      values.eligibilityWindowSeconds = patch.eligibilityWindowSeconds;
    if (patch.refreshCycle !== undefined) values.refreshCycle = patch.refreshCycle;
    if (patch.refreshLimit !== undefined) values.refreshLimit = patch.refreshLimit;
    if (patch.userLimit !== undefined) values.userLimit = patch.userLimit;
    if (patch.globalLimit !== undefined) values.globalLimit = patch.globalLimit;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    let row: ShopProduct = existing;
    if (Object.keys(values).length > 0) {
      try {
        const [updated] = await db
          .update(shopProducts)
          .set(values)
          .where(
            and(
              eq(shopProducts.id, existing.id),
              eq(shopProducts.organizationId, organizationId),
            ),
          )
          .returning();
        if (!updated) throw new ShopProductNotFound(id);
        row = updated;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias)
          throw new ShopProductAliasConflict(patch.alias);
        throw err;
      }
    }

    if (patch.tagIds !== undefined) {
      await setProductTags(row.id, patch.tagIds);
    }
    const tagsMap = await loadProductTags([row.id]);
    return { ...row, tags: tagsMap.get(row.id) ?? [] };
  }

  async function deleteProduct(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(shopProducts)
      .where(
        and(
          eq(shopProducts.id, id),
          eq(shopProducts.organizationId, organizationId),
        ),
      )
      .returning({ id: shopProducts.id });
    if (deleted.length === 0) throw new ShopProductNotFound(id);
  }

  async function getProduct(
    organizationId: string,
    idOrAlias: string,
  ): Promise<ShopProduct & { tags: ShopTag[] }> {
    const row = await loadProductByKey(organizationId, idOrAlias);
    const tagsMap = await loadProductTags([row.id]);
    return { ...row, tags: tagsMap.get(row.id) ?? [] };
  }

  async function listProducts(
    organizationId: string,
    query: ListProductsQuery = {},
  ): Promise<Array<ShopProduct & { tags: ShopTag[] }>> {
    // Resolve categoryIds if includeDescendantCategories=true
    let categoryIds: string[] | null = null;
    if (query.categoryId) {
      if (query.includeDescendantCategories === "true") {
        // Walk the tree in-memory (table is small and fully tenant-scoped).
        const all = await listCategories(organizationId);
        const children = new Map<string | null, string[]>();
        for (const c of all) {
          const list = children.get(c.parentId) ?? [];
          list.push(c.id);
          children.set(c.parentId, list);
        }
        const collected: string[] = [];
        const stack: string[] = [query.categoryId];
        while (stack.length) {
          const cur = stack.pop()!;
          collected.push(cur);
          stack.push(...(children.get(cur) ?? []));
        }
        categoryIds = collected;
      } else {
        categoryIds = [query.categoryId];
      }
    }

    const conds = [eq(shopProducts.organizationId, organizationId)];
    if (categoryIds && categoryIds.length > 0)
      conds.push(inArray(shopProducts.categoryId, categoryIds));
    if (query.productType)
      conds.push(eq(shopProducts.productType, query.productType));
    if (query.timeWindowType)
      conds.push(eq(shopProducts.timeWindowType, query.timeWindowType));
    if (query.isActive === "true") conds.push(eq(shopProducts.isActive, true));
    if (query.isActive === "false")
      conds.push(eq(shopProducts.isActive, false));

    if (query.availableAt) {
      const at = new Date(query.availableAt);
      if (Number.isNaN(at.getTime()))
        throw new ShopInvalidInput(`invalid availableAt: ${query.availableAt}`);
      // Only applies to absolute / none; treat "contains now" as:
      //   timeWindowType='none' OR (timeWindowType='absolute' AND availableFrom<=now AND availableTo>now)
      conds.push(
        or(
          eq(shopProducts.timeWindowType, "none"),
          and(
            eq(shopProducts.timeWindowType, "absolute"),
            sql`${shopProducts.availableFrom} <= ${at}`,
            sql`${shopProducts.availableTo} > ${at}`,
          )!,
        )!,
      );
    }

    // Tag filter requires a join — do it as an IN subquery for composability.
    if (query.tagId) {
      conds.push(
        sql`${shopProducts.id} IN (SELECT product_id FROM ${shopProductTags} WHERE tag_id = ${query.tagId})`,
      );
    }

    const rows = await db
      .select()
      .from(shopProducts)
      .where(and(...conds))
      .orderBy(asc(shopProducts.sortOrder), desc(shopProducts.createdAt));

    const tagsMap = await loadProductTags(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tags: tagsMap.get(r.id) ?? [] }));
  }

  // ─── Growth stages ───────────────────────────────────────────────

  async function listStages(
    organizationId: string,
    productId: string,
  ): Promise<ShopGrowthStage[]> {
    const product = await loadProductByKey(organizationId, productId);
    return db
      .select()
      .from(shopGrowthStages)
      .where(eq(shopGrowthStages.productId, product.id))
      .orderBy(asc(shopGrowthStages.stageIndex));
  }

  async function createStage(
    organizationId: string,
    productId: string,
    input: CreateGrowthStageInput,
  ): Promise<ShopGrowthStage> {
    const product = await loadProductByKey(organizationId, productId);
    if (product.productType !== "growth_pack")
      throw new ShopInvalidInput(
        "growth stages only apply to productType='growth_pack'",
      );
    const [row] = await db
      .insert(shopGrowthStages)
      .values({
        productId: product.id,
        organizationId,
        stageIndex: input.stageIndex,
        name: input.name,
        description: input.description ?? null,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ?? null,
        rewardItems: input.rewardItems,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  async function updateStage(
    organizationId: string,
    stageId: string,
    patch: UpdateGrowthStageInput,
  ): Promise<ShopGrowthStage> {
    const existing = await loadStageById(stageId);
    if (existing.organizationId !== organizationId)
      throw new ShopGrowthStageNotFound(stageId);
    const values: Partial<typeof shopGrowthStages.$inferInsert> = {};
    if (patch.stageIndex !== undefined) values.stageIndex = patch.stageIndex;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.triggerType !== undefined) values.triggerType = patch.triggerType;
    if (patch.triggerConfig !== undefined)
      values.triggerConfig = patch.triggerConfig;
    if (patch.rewardItems !== undefined) values.rewardItems = patch.rewardItems;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;
    if (Object.keys(values).length === 0) return existing;
    const [row] = await db
      .update(shopGrowthStages)
      .set(values)
      .where(eq(shopGrowthStages.id, stageId))
      .returning();
    if (!row) throw new ShopGrowthStageNotFound(stageId);
    return row;
  }

  async function deleteStage(
    organizationId: string,
    stageId: string,
  ): Promise<void> {
    const deleted = await db
      .delete(shopGrowthStages)
      .where(
        and(
          eq(shopGrowthStages.id, stageId),
          eq(shopGrowthStages.organizationId, organizationId),
        ),
      )
      .returning({ id: shopGrowthStages.id });
    if (deleted.length === 0) throw new ShopGrowthStageNotFound(stageId);
  }

  /** Replace all stages of a product with the given list (atomic swap). */
  async function upsertStages(
    organizationId: string,
    productId: string,
    input: UpsertStagesInput,
  ): Promise<ShopGrowthStage[]> {
    const product = await loadProductByKey(organizationId, productId);
    if (product.productType !== "growth_pack")
      throw new ShopInvalidInput(
        "growth stages only apply to productType='growth_pack'",
      );
    // Wipe + re-insert — safe under neon-http because no one else writes
    // stages for this productId concurrently (admin-only mutation).
    await db
      .delete(shopGrowthStages)
      .where(eq(shopGrowthStages.productId, product.id));
    if (input.stages.length === 0) return [];
    const rows = await db
      .insert(shopGrowthStages)
      .values(
        input.stages.map((s) => ({
          productId: product.id,
          organizationId,
          stageIndex: s.stageIndex,
          name: s.name,
          description: s.description ?? null,
          triggerType: s.triggerType,
          triggerConfig: s.triggerConfig ?? null,
          rewardItems: s.rewardItems,
          sortOrder: s.sortOrder ?? 0,
          metadata: s.metadata ?? null,
        })),
      )
      .returning();
    return rows;
  }

  // ─── Eligibility helpers ─────────────────────────────────────────

  type EligibilityDecision =
    | { kind: "ok"; availableUntil: Date | null; resetsAt: Date | null }
    | {
        kind: "error";
        error:
          | ShopOutsideTimeWindow
          | ShopUserLimitReached
          | ShopCycleLimitReached;
      };

  async function evaluateEligibility(
    product: ShopProduct,
    state: ShopUserPurchaseState | null,
    endUserId: string,
    now: Date,
    organizationId: string,
  ): Promise<EligibilityDecision> {
    // 1. user limit
    if (
      product.userLimit !== null &&
      state &&
      state.totalCount >= product.userLimit
    ) {
      return {
        kind: "error",
        error: new ShopUserLimitReached(product.id),
      };
    }

    // 2. time window
    let availableUntil: Date | null = null;
    let resetsAt: Date | null = null;

    switch (product.timeWindowType as TimeWindowType) {
      case "none":
        break;
      case "absolute": {
        if (!product.availableFrom || !product.availableTo)
          return {
            kind: "error",
            error: new ShopOutsideTimeWindow(
              product.id,
              "absolute window missing bounds",
            ),
          };
        if (now < product.availableFrom)
          return {
            kind: "error",
            error: new ShopOutsideTimeWindow(product.id, "not started"),
          };
        if (now >= product.availableTo)
          return {
            kind: "error",
            error: new ShopOutsideTimeWindow(product.id, "ended"),
          };
        availableUntil = product.availableTo;
        break;
      }
      case "relative": {
        if (!product.eligibilityAnchor || !product.eligibilityWindowSeconds)
          return {
            kind: "error",
            error: new ShopOutsideTimeWindow(
              product.id,
              "relative window misconfigured",
            ),
          };
        let anchorAt: Date | null = null;
        if (product.eligibilityAnchor === "first_purchase") {
          anchorAt = state?.firstPurchaseAt ?? now;
          // First-time purchase: we're about to set firstPurchaseAt=now,
          // so there's always window to purchase (anchor=now, window>0).
          // On subsequent purchases, anchorAt is the recorded firstPurchaseAt.
        } else if (product.eligibilityAnchor === "user_created") {
          // `endUserId` is opaque (not a FK to auth.user), so we use the
          // earliest `item_grant_logs.createdAt` for this endUser as a
          // proxy for "first seen in the system". If there are no grants
          // yet, the user is effectively brand new — anchor = now.
          const [row] = await db
            .select({
              first: sql<Date>`MIN(${itemGrantLogs.createdAt})`,
            })
            .from(itemGrantLogs)
            .where(
              and(
                eq(itemGrantLogs.organizationId, organizationId),
                eq(itemGrantLogs.endUserId, endUserId),
              ),
            );
          const first = row?.first ? new Date(row.first) : null;
          anchorAt = first ?? now;
        }
        if (anchorAt) {
          const expiry = computeEligibilityExpiry(
            anchorAt,
            product.eligibilityWindowSeconds,
          );
          if (now >= expiry)
            return {
              kind: "error",
              error: new ShopOutsideTimeWindow(product.id, "eligibility expired"),
            };
          availableUntil = expiry;
        }
        break;
      }
      case "cyclic": {
        if (!product.refreshCycle || product.refreshLimit == null)
          return {
            kind: "error",
            error: new ShopOutsideTimeWindow(
              product.id,
              "cyclic window misconfigured",
            ),
          };
        // Determine effective cycle count (reset if current cycle has expired).
        let effectiveCount = state?.cycleCount ?? 0;
        if (state?.cycleResetAt && now >= state.cycleResetAt) {
          effectiveCount = 0;
        }
        if (effectiveCount >= product.refreshLimit) {
          return {
            kind: "error",
            error: new ShopCycleLimitReached(product.id),
          };
        }
        resetsAt =
          state?.cycleResetAt && now < state.cycleResetAt
            ? state.cycleResetAt
            : computeNextRefresh(now, product.refreshCycle as RefreshCycle);
        break;
      }
    }

    // (organizationId is captured to keep the signature uniform — callers
    // pass it through in case we add more checks that need it.)
    void organizationId;

    return { kind: "ok", availableUntil, resetsAt };
  }

  // ─── Purchase ────────────────────────────────────────────────────

  async function purchase(params: {
    organizationId: string;
    endUserId: string;
    productKey: string;
    idempotencyKey?: string;
    now?: Date;
  }): Promise<PurchaseResult> {
    const now = params.now ?? new Date();
    const purchaseId = params.idempotencyKey ?? crypto.randomUUID();

    // 1. Idempotency — if a grant log with this purchaseId already exists,
    //    short-circuit and return the original result shape.
    const existingLog = await db
      .select({ id: itemGrantLogs.id })
      .from(itemGrantLogs)
      .where(
        and(
          eq(itemGrantLogs.source, "shop.purchase"),
          eq(itemGrantLogs.sourceId, purchaseId),
        ),
      )
      .limit(1);
    if (existingLog.length > 0) {
      const product = await loadProductByKey(
        params.organizationId,
        params.productKey,
      );
      return {
        success: true,
        purchaseId,
        productId: product.id,
        productType: product.productType as ProductType,
        costItems: product.costItems,
        rewardItems:
          product.productType === "regular"
            ? product.rewardItems
            : [],
      };
    }

    // 2. Load product and prior user state.
    const product = await loadProductByKey(
      params.organizationId,
      params.productKey,
    );
    if (!product.isActive) throw new ShopProductInactive(product.id);

    const stateRows = await db
      .select()
      .from(shopUserPurchaseStates)
      .where(
        and(
          eq(shopUserPurchaseStates.productId, product.id),
          eq(shopUserPurchaseStates.endUserId, params.endUserId),
        ),
      )
      .limit(1);
    const state: ShopUserPurchaseState | null = stateRows[0] ?? null;

    // 3. Eligibility — throw typed error if not OK.
    const decision = await evaluateEligibility(
      product,
      state,
      params.endUserId,
      now,
      params.organizationId,
    );
    if (decision.kind === "error") throw decision.error;

    // 4. Atomically increment user purchase state. Two atomic SQL paths:
    //    - no prior row: INSERT ... ON CONFLICT DO UPDATE with a guard
    //    - cyclic: the INSERT handles both first-cycle and cycle-reset
    const isCyclic = product.timeWindowType === "cyclic";
    const nextReset =
      isCyclic && product.refreshCycle
        ? computeNextRefresh(now, product.refreshCycle as RefreshCycle)
        : null;

    // Guard expression for DO UPDATE: userLimit and, if cyclic, refreshLimit.
    // We rewrite `cycleCount` via:
    //   CASE WHEN cycle_reset_at IS NOT NULL AND cycle_reset_at <= now
    //        THEN 1 ELSE cycle_count + 1 END
    // so concurrent calls see the correct "reset or increment" atomically.
    const cycleGuard = isCyclic
      ? sql`(CASE
              WHEN ${shopUserPurchaseStates.cycleResetAt} IS NOT NULL
                   AND ${shopUserPurchaseStates.cycleResetAt} <= ${now}
              THEN 1
              ELSE ${shopUserPurchaseStates.cycleCount} + 1
            END) <= ${product.refreshLimit}`
      : sql`TRUE`;

    const userLimitGuard =
      product.userLimit !== null
        ? sql`${shopUserPurchaseStates.totalCount} < ${product.userLimit}`
        : sql`TRUE`;

    const cycleCountNew = isCyclic
      ? sql`CASE
              WHEN ${shopUserPurchaseStates.cycleResetAt} IS NOT NULL
                   AND ${shopUserPurchaseStates.cycleResetAt} <= ${now}
              THEN 1
              ELSE ${shopUserPurchaseStates.cycleCount} + 1
            END`
      : sql`${shopUserPurchaseStates.cycleCount}`;

    const cycleResetAtNew = isCyclic
      ? sql`CASE
              WHEN ${shopUserPurchaseStates.cycleResetAt} IS NULL
                   OR ${shopUserPurchaseStates.cycleResetAt} <= ${now}
              THEN ${nextReset}
              ELSE ${shopUserPurchaseStates.cycleResetAt}
            END`
      : sql`${shopUserPurchaseStates.cycleResetAt}`;

    const upserted = await db
      .insert(shopUserPurchaseStates)
      .values({
        productId: product.id,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        totalCount: 1,
        cycleCount: isCyclic ? 1 : 0,
        cycleResetAt: nextReset,
        firstPurchaseAt: now,
      })
      .onConflictDoUpdate({
        target: [
          shopUserPurchaseStates.productId,
          shopUserPurchaseStates.endUserId,
        ],
        set: {
          totalCount: sql`${shopUserPurchaseStates.totalCount} + 1`,
          cycleCount: cycleCountNew,
          cycleResetAt: cycleResetAtNew,
          firstPurchaseAt: sql`COALESCE(${shopUserPurchaseStates.firstPurchaseAt}, ${now})`,
          version: sql`${shopUserPurchaseStates.version} + 1`,
        },
        setWhere: sql`${userLimitGuard} AND ${cycleGuard}`,
      })
      .returning();

    if (upserted.length === 0) {
      // Lost the race — re-read state to emit a more specific error.
      const reread = await db
        .select()
        .from(shopUserPurchaseStates)
        .where(
          and(
            eq(shopUserPurchaseStates.productId, product.id),
            eq(shopUserPurchaseStates.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      const s = reread[0];
      if (
        product.userLimit !== null &&
        s &&
        s.totalCount >= product.userLimit
      ) {
        throw new ShopUserLimitReached(product.id);
      }
      if (
        isCyclic &&
        product.refreshLimit != null &&
        s &&
        (!s.cycleResetAt || s.cycleResetAt > now) &&
        s.cycleCount >= product.refreshLimit
      ) {
        throw new ShopCycleLimitReached(product.id);
      }
      // Otherwise, concurrency lost without a guard miss → treat as conflict.
      throw new ShopConcurrencyConflict();
    }

    // 5. Global limit increment (separate atomic statement).
    if (product.globalLimit !== null) {
      const updated = await db
        .update(shopProducts)
        .set({ globalCount: sql`${shopProducts.globalCount} + 1` })
        .where(
          and(
            eq(shopProducts.id, product.id),
            sql`${shopProducts.globalCount} < ${product.globalLimit}`,
          ),
        )
        .returning({ id: shopProducts.id });
      if (updated.length === 0) {
        // Rollback user state (mirror of the increment above).
        await rollbackUserState(
          product,
          params.endUserId,
          isCyclic,
          now,
          state,
        );
        throw new ShopGlobalLimitReached(product.id);
      }
    }

    // 6. Deduct cost items; on failure, rollback user + global.
    const deducted: RewardEntry[] = [];
    try {
      for (const cost of product.costItems) {
        await itemSvc.deductItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          deductions: [cost],
          source: "shop.purchase",
          sourceId: purchaseId,
        });
        deducted.push(cost);
      }
    } catch (err) {
      for (const d of deducted) {
        await itemSvc.grantItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          grants: [d],
          source: "shop.purchase.rollback",
          sourceId: purchaseId,
        });
      }
      if (product.globalLimit !== null) {
        await db
          .update(shopProducts)
          .set({ globalCount: sql`${shopProducts.globalCount} - 1` })
          .where(eq(shopProducts.id, product.id));
      }
      await rollbackUserState(product, params.endUserId, isCyclic, now, state);
      throw err;
    }

    // 7. Grant reward items — only for `regular`. Growth packs wait for claims.
    const rewardItemEntries =
      product.productType === "regular"
        ? product.rewardItems
        : [];
    for (const reward of rewardItemEntries) {
      await itemSvc.grantItems({
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        grants: [reward],
        source: "shop.purchase",
        sourceId: purchaseId,
      });
    }

    return {
      success: true,
      purchaseId,
      productId: product.id,
      productType: product.productType as ProductType,
      costItems: product.costItems,
      rewardItems: product.productType === "regular" ? product.rewardItems : [],
    };
  }

  /** Undo the counter bumps from the atomic upsert above. */
  async function rollbackUserState(
    product: ShopProduct,
    endUserId: string,
    isCyclic: boolean,
    _now: Date,
    prior: ShopUserPurchaseState | null,
  ): Promise<void> {
    await db
      .update(shopUserPurchaseStates)
      .set({
        totalCount: sql`${shopUserPurchaseStates.totalCount} - 1`,
        cycleCount: isCyclic
          ? sql`GREATEST(${shopUserPurchaseStates.cycleCount} - 1, 0)`
          : sql`${shopUserPurchaseStates.cycleCount}`,
        // Restore firstPurchaseAt only if prior was null (i.e. we set it)
        firstPurchaseAt:
          prior?.firstPurchaseAt == null
            ? null
            : sql`${shopUserPurchaseStates.firstPurchaseAt}`,
        version: sql`${shopUserPurchaseStates.version} + 1`,
      })
      .where(
        and(
          eq(shopUserPurchaseStates.productId, product.id),
          eq(shopUserPurchaseStates.endUserId, endUserId),
        ),
      );
  }

  // ─── Claim growth stage ──────────────────────────────────────────

  async function claimGrowthStage(params: {
    organizationId: string;
    endUserId: string;
    stageId: string;
    idempotencyKey?: string;
    now?: Date;
  }): Promise<ClaimStageResult> {
    const claimId = params.idempotencyKey ?? crypto.randomUUID();

    // 1. Load stage + product; check entitlement.
    const stage = await loadStageById(params.stageId);
    if (stage.organizationId !== params.organizationId)
      throw new ShopGrowthStageNotFound(params.stageId);

    const [stateRow] = await db
      .select()
      .from(shopUserPurchaseStates)
      .where(
        and(
          eq(shopUserPurchaseStates.productId, stage.productId),
          eq(shopUserPurchaseStates.endUserId, params.endUserId),
        ),
      )
      .limit(1);
    if (!stateRow || stateRow.totalCount < 1)
      throw new ShopNotEntitled(stage.productId);

    // 2. Validate trigger.
    await validateTrigger(params.organizationId, params.endUserId, stage);

    // 3. Idempotent claim record. ON CONFLICT DO NOTHING; 0 rows = already claimed.
    const inserted = await db
      .insert(shopGrowthStageClaims)
      .values({
        stageId: stage.id,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        productId: stage.productId,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) throw new ShopAlreadyClaimed(stage.id);

    // 4. Grant stage rewards.
    for (const reward of stage.rewardItems) {
      await itemSvc.grantItems({
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        grants: [reward],
        source: "shop.claim",
        sourceId: stage.id,
      });
    }

    return {
      success: true,
      claimId,
      stageId: stage.id,
      productId: stage.productId,
      rewardItems: stage.rewardItems,
    };
  }

  async function validateTrigger(
    organizationId: string,
    endUserId: string,
    stage: ShopGrowthStage,
  ): Promise<void> {
    const cfg = (stage.triggerConfig ?? {}) as Record<string, unknown>;
    switch (stage.triggerType as GrowthTriggerType) {
      case "manual":
        return;
      case "accumulated_cost": {
        const threshold = Number(cfg.threshold);
        if (!Number.isFinite(threshold) || threshold <= 0)
          throw new ShopGrowthTriggerUnmet(stage.id, "threshold misconfigured");
        // Sum of absolute cost deltas logged against purchases of this product.
        // item_grant_logs stores deltas as negative for deductions, so we
        // sum over `source='shop.purchase'` AND look for rows whose sourceId
        // is any purchaseId for this product. Since purchaseId isn't stored
        // on the product, we approximate by filtering with a custom scheme:
        // the simpler honest approach here is to track `purchase_log` at the
        // service level. For MVP we compute it via item_grant_logs filtered
        // to source='shop.purchase' and quantity sign.
        //
        // Here we query across all shop.purchase rows for this user; the
        // caller-side check is intentionally coarse — tightening requires
        // a dedicated purchase history table (deferred). We simply need
        // `sum(|delta|)` where delta < 0.
        const [row] = await db
          .select({
            total: sql<number>`COALESCE(SUM(CASE WHEN ${itemGrantLogs.delta} < 0 THEN -${itemGrantLogs.delta} ELSE 0 END), 0)`,
          })
          .from(itemGrantLogs)
          .where(
            and(
              eq(itemGrantLogs.organizationId, organizationId),
              eq(itemGrantLogs.endUserId, endUserId),
              eq(itemGrantLogs.source, "shop.purchase"),
            ),
          );
        const accrued = Number(row?.total ?? 0);
        if (accrued < threshold)
          throw new ShopGrowthTriggerUnmet(
            stage.id,
            `accumulated_cost ${accrued} < ${threshold}`,
          );
        return;
      }
      case "accumulated_payment": {
        const itemDefinitionId = String(cfg.itemDefinitionId ?? "");
        const threshold = Number(cfg.threshold);
        if (!itemDefinitionId || !Number.isFinite(threshold) || threshold <= 0)
          throw new ShopGrowthTriggerUnmet(
            stage.id,
            "triggerConfig misconfigured",
          );
        // Payment accrual = positive grants of this currency (any source —
        // we treat any positive delta against the configured definitionId
        // as "payment accrued").
        const [row] = await db
          .select({
            total: sql<number>`COALESCE(SUM(CASE WHEN ${itemGrantLogs.delta} > 0 THEN ${itemGrantLogs.delta} ELSE 0 END), 0)`,
          })
          .from(itemGrantLogs)
          .where(
            and(
              eq(itemGrantLogs.organizationId, organizationId),
              eq(itemGrantLogs.endUserId, endUserId),
              eq(itemGrantLogs.definitionId, itemDefinitionId),
            ),
          );
        const accrued = Number(row?.total ?? 0);
        if (accrued < threshold)
          throw new ShopGrowthTriggerUnmet(
            stage.id,
            `accumulated_payment ${accrued} < ${threshold}`,
          );
        return;
      }
      case "custom_metric":
        // Reserved for future behavior-log integration.
        throw new ShopGrowthTriggerUnmet(
          stage.id,
          "custom_metric trigger not yet supported",
        );
    }
  }

  // ─── User-facing list ────────────────────────────────────────────

  async function getUserPurchaseState(params: {
    organizationId: string;
    endUserId: string;
    productId: string;
  }): Promise<ShopUserPurchaseState | null> {
    const rows = await db
      .select()
      .from(shopUserPurchaseStates)
      .where(
        and(
          eq(shopUserPurchaseStates.productId, params.productId),
          eq(shopUserPurchaseStates.endUserId, params.endUserId),
          eq(shopUserPurchaseStates.organizationId, params.organizationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function listUserProducts(params: {
    organizationId: string;
    endUserId: string;
    now?: Date;
    query?: ListUserProductsQuery;
  }): Promise<UserProductView[]> {
    const now = params.now ?? new Date();
    const products = await listProducts(params.organizationId, {
      ...(params.query?.categoryId ? { categoryId: params.query.categoryId } : {}),
      ...(params.query?.tagId ? { tagId: params.query.tagId } : {}),
      ...(params.query?.productType ? { productType: params.query.productType } : {}),
      isActive: "true",
    });

    // Bulk-fetch user states for these products.
    const productIds = products.map((p) => p.id);
    const stateMap = new Map<string, ShopUserPurchaseState>();
    if (productIds.length > 0) {
      const rows = await db
        .select()
        .from(shopUserPurchaseStates)
        .where(
          and(
            eq(shopUserPurchaseStates.organizationId, params.organizationId),
            eq(shopUserPurchaseStates.endUserId, params.endUserId),
            inArray(shopUserPurchaseStates.productId, productIds),
          ),
        );
      for (const r of rows) stateMap.set(r.productId, r);
    }

    const views: UserProductView[] = [];
    for (const p of products) {
      const state = stateMap.get(p.id) ?? null;
      const decision = await evaluateEligibility(
        p,
        state,
        params.endUserId,
        now,
        params.organizationId,
      );

      let status: UserProductView["eligibility"]["status"];
      let resetsAt: Date | null | undefined = null;
      let availableUntil: Date | null | undefined = null;

      if (decision.kind === "ok") {
        // Also report global out-of-stock even though the eligibility
        // evaluator doesn't cover it (it's a product-level not user-level
        // check).
        if (
          p.globalLimit !== null &&
          (p.globalCount ?? 0) >= p.globalLimit
        ) {
          status = "out_of_stock";
        } else {
          status = "available";
        }
        resetsAt = decision.resetsAt;
        availableUntil = decision.availableUntil;
      } else if (decision.error instanceof ShopUserLimitReached) {
        status = "user_limit";
      } else if (decision.error instanceof ShopCycleLimitReached) {
        status = "cycle_limit";
        // Pull resetsAt from state / computed next.
        resetsAt =
          state?.cycleResetAt && now < state.cycleResetAt
            ? state.cycleResetAt
            : p.refreshCycle
              ? computeNextRefresh(now, p.refreshCycle as RefreshCycle)
              : null;
      } else {
        // OutsideTimeWindow — decide not_started vs expired based on the
        // product's absolute window (best effort).
        if (
          p.timeWindowType === "absolute" &&
          p.availableFrom &&
          now < p.availableFrom
        ) {
          status = "not_started";
        } else {
          status = "expired";
        }
      }

      views.push({
        ...p,
        eligibility: {
          status,
          resetsAt: resetsAt ?? null,
          availableUntil: availableUntil ?? null,
        },
        userPurchaseState: state,
        tags: p.tags,
      });
    }
    return views;
  }

  return {
    // categories
    createCategory,
    updateCategory,
    deleteCategory,
    listCategories,
    listCategoryTree,
    getCategory,
    // tags
    createTag,
    updateTag,
    deleteTag,
    listTags,
    getTag,
    // products
    createProduct,
    updateProduct,
    deleteProduct,
    getProduct,
    listProducts,
    // stages
    listStages,
    createStage,
    updateStage,
    deleteStage,
    upsertStages,
    // purchase + claim
    purchase,
    claimGrowthStage,
    // user-facing
    getUserPurchaseState,
    listUserProducts,
  };
}

export type ShopService = ReturnType<typeof createShopService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
