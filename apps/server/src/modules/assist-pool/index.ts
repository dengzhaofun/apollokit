/**
 * Assist-pool module barrel.
 *
 * Glues `deps` to the service factory, registers the module's internal
 * events in the event-registry (so admin UI + task forwarder see them),
 * and re-exports the routers for `src/index.ts` to mount.
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { createAssistPoolService } from "./service";

registerEvent({
  name: "assist_pool.instance_created",
  owner: "assist-pool",
  description:
    "用户发起一个助力池实例(砍价 / 助力)。endUserId = 发起人。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "configId", type: "string", required: true },
    { path: "instanceId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "targetAmount", type: "number", required: true },
    { path: "expiresAt", type: "string", required: true },
  ],
});

registerEvent({
  name: "assist_pool.contributed",
  owner: "assist-pool",
  description:
    "一次助力贡献写入成功。endUserId = 助力者(贡献者),initiatorEndUserId 是被助力者。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "configId", type: "string", required: true },
    { path: "instanceId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "initiatorEndUserId", type: "string", required: true },
    { path: "amount", type: "number", required: true },
    { path: "remaining", type: "number", required: true },
  ],
});

registerEvent({
  name: "assist_pool.completed",
  owner: "assist-pool",
  description:
    "助力池达成目标,奖励已发放(去重 ledger 保证只发一次)。endUserId = 发起人。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "configId", type: "string", required: true },
    { path: "instanceId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "rewards", type: "array", required: true },
  ],
});

registerEvent({
  name: "assist_pool.expired",
  owner: "assist-pool",
  description:
    "助力池实例过期(cron 扫过期 或 admin 强制过期)。不发奖。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "configId", type: "string", required: true },
    { path: "instanceId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "reason", type: "string", required: true },
  ],
});

export { createAssistPoolService };
export type { AssistPoolService } from "./service";

export const assistPoolService = createAssistPoolService(deps, {
  itemSvc: itemService,
  currencySvc: currencyService,
});

export { assistPoolRouter } from "./routes";
export { assistPoolClientRouter } from "./client-routes";
