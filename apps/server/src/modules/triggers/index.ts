/**
 * Triggers module barrel —— wires service factory + throttler to the
 * deps singleton, re-exports everything routes / queue consumer need.
 *
 * 设计原则:trigger 不依赖 webhooks。Trigger 引擎是「内循环替代 webhook 出墙」
 * 的设计,actions 仅做 server 内部能直接执行的能力(emit_event / 未来的
 * grant_reward / unlock_feature / send_notification)。想出墙到外部
 * webhook 的事件流走 webhook 模块自身订阅,不经 trigger。
 *
 * 装载顺序约束：本 barrel 不调用 installTriggerEventBridge —— 由
 * src/index.ts 在所有 module registerEvent 完成后显式 install。
 */

import { deps } from "../../deps";

import { createTriggerService } from "./service";
import { createThrottler } from "./throttle";

const throttler = createThrottler({ redis: deps.redis });

export { createTriggerService };
export type { TriggerService } from "./service";

export const triggerService = createTriggerService(deps, { throttler });

export { triggersRouter } from "./routes";
export {
  installTriggerEventBridge,
  type TriggerEventSink,
} from "./event-bridge";
