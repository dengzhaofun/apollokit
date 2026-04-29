/**
 * Action: unlock_feature —— 给玩家解锁某个 feature。
 *
 * 写入 feature_unlocks 表;同 (org, endUser, featureKey) 已存在时 ON CONFLICT
 * DO NOTHING 保证幂等(consumer 重试 / 用户多次满足条件触发都不重复解锁)。
 *
 * Source 字段记录 "trigger:{traceId}" 便于审计;sourceRef 记录触发事件名。
 *
 * Payload 必须含 endUserId(从触发事件 payload 里取);没有 endUserId 的
 * 平台事件不能配 unlock_feature(不知道给谁解锁) —— 此时抛错,service 写入
 * actionResults.status='failed' 但不阻塞其它 action。
 */

import { featureUnlocks } from "../../../schema/feature-unlocks";
import type { UnlockFeatureAction } from "../types";

import type { ActionHandler } from "./types";

export const unlockFeatureAction: ActionHandler<UnlockFeatureAction> = async (
  action,
  ctx,
  deps,
) => {
  const endUserId = ctx.triggerPayload.endUserId;
  if (typeof endUserId !== "string" || !endUserId) {
    throw new Error(
      "unlock_feature requires payload.endUserId — platform-level events without endUserId can't be unlocked for a specific user",
    );
  }
  if (!action.featureKey) {
    throw new Error("unlock_feature: featureKey is required");
  }

  const inserted = await deps.db
    .insert(featureUnlocks)
    .values({
      organizationId: ctx.orgId,
      endUserId,
      featureKey: action.featureKey,
      source: `trigger:${ctx.traceId}`,
      sourceRef: ctx.triggerEventName,
    })
    .onConflictDoNothing()
    .returning({ id: featureUnlocks.id });

  return {
    data: {
      featureKey: action.featureKey,
      endUserId,
      // 区分「新解锁」和「已经解锁过(幂等命中)」
      alreadyUnlocked: inserted.length === 0,
    },
  };
};
