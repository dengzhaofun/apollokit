/**
 * Battle Pass module barrel —— 装配 service + handler + registration。
 *
 * 本 barrel 会在 root `src/index.ts` 被 import 时：
 *   1. 用 `deps` 构造 `battlePassService` 单例
 *   2. 创建 `battlePassKindHandler` 并注册到 `kindRegistry`
 *   3. 注册内部事件描述符到 event-registry（供 admin / event-catalog 展示）
 *
 * 注意：`wireKindEventSubscriptions(events)` 不在本文件调用 —— 它需
 * 要在所有 kind handler 都 register 之后统一调一次，所以放在 root
 * `src/index.ts`。本模块只保证自己 register 完成。
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { kindRegistry } from "../activity/kind/registry";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { createBattlePassHandler } from "./handler";
import { createBattlePassService } from "./service";

// ─── Internal event descriptors（runtime catalog） ───────────────

registerEvent({
  name: "battlepass.xp.earned",
  owner: "battle-pass",
  description:
    "End user earned battle-pass XP (typically from completing a bound task).",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "taskDefinitionId", type: "string", required: false },
    { path: "xp", type: "number", required: true },
    { path: "oldLevel", type: "number", required: true },
    { path: "newLevel", type: "number", required: true },
    { path: "currentXp", type: "number", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "battlepass.level.up",
  owner: "battle-pass",
  description:
    "End user's battle-pass level increased (fired only on the transition, not every xp.earned).",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "oldLevel", type: "number", required: true },
    { path: "newLevel", type: "number", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "battlepass.tier.granted",
  owner: "battle-pass",
  description:
    "A paid tier has been activated for an end user (from payment callback, admin grant, etc.).",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "tierCode", type: "string", required: true },
    { path: "source", type: "string", required: true },
    { path: "externalOrderId", type: "string", required: false },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "battlepass.level.claimed",
  owner: "battle-pass",
  description: "End user claimed the reward for a specific level+tier.",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "seasonId", type: "string", required: true },
    { path: "level", type: "number", required: true },
    { path: "tierCode", type: "string", required: true },
  ],
  forwardToTask: false,
});

// ─── Factory + singleton ───────────────────────────────────────

export { createBattlePassService };
export type { BattlePassService } from "./service";

export const battlePassService = createBattlePassService(deps, () => ({
  itemSvc: itemService,
  currencySvc: currencyService,
}));

// ─── Kind handler registration ─────────────────────────────────

const battlePassKindHandler = createBattlePassHandler(() => battlePassService);
kindRegistry.register(battlePassKindHandler);

export { battlePassKindHandler };

export { battlePassRouter } from "./routes";
export { battlePassClientRouter } from "./client-routes";
