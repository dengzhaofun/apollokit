import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

/**
 * Feature unlocks —— 记录"玩家解锁了哪个功能/入口"。
 *
 * 由 trigger 引擎 unlock_feature action 写入(也可以被业务 service
 * 直接调用)。前端 / SDK 通过查询表判断"该用户是否解锁了 feature X"。
 *
 * 幂等:`(organization_id, end_user_id, feature_key)` 复合唯一,
 * 重复 unlock 同一 feature 走 ON CONFLICT DO NOTHING。
 *
 * Source 字段允许追溯解锁的原因(trigger rule id / 手动管理 / 业务事件)。
 */
export const featureUnlocks = pgTable(
  "feature_unlocks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    /** 解锁的 feature 标识 —— 由租户业务定义,server 不约束格式。 */
    featureKey: text("feature_key").notNull(),
    /** 谁触发的解锁。"trigger:{ruleId}" / "manual:{adminUserId}" / "system" 等。 */
    source: text("source"),
    /** 关联引用 —— 例如 trigger 规则的 executionId 或业务 event id。 */
    sourceRef: text("source_ref"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("feature_unlocks_tenant_user_key_idx").on(
      t.tenantId,
      t.endUserId,
      t.featureKey,
    ),
    // 列表查询「某用户解锁了哪些 feature」
    index("feature_unlocks_tenant_user_idx").on(t.tenantId, t.endUserId),
    // 列表查询「全 org 谁解锁了 feature X」
    index("feature_unlocks_tenant_key_idx").on(t.tenantId, t.featureKey),
  ],
);
