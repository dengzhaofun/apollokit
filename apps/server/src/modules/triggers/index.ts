/**
 * Triggers module barrel —— wires service factory + throttler to the
 * deps singleton, re-exports everything routes / queue consumer need.
 *
 * 设计原则:trigger 不依赖 webhooks。Trigger 引擎是「内循环替代 webhook 出墙」
 * 的设计,actions 仅做 server 内部能直接执行的能力(emit_event / unlock_feature
 * / 未来的 grant_reward / send_notification)。想出墙到外部 webhook 的事件
 * 流走 webhook 模块自身订阅,不经 trigger。
 *
 * 事件接入由 lib/event-dispatcher.ts 统一处理 —— 同一事件命中 webhook /
 * trigger-rule 两个 capability 时只发一条 envelope,consumer 按数组路由。
 */

import { deps } from "../../deps";

import { createTriggerService } from "./service";
import { createThrottler } from "./throttle";

const throttler = createThrottler({ redis: deps.redis });

export { createTriggerService };
export type { TriggerService } from "./service";

export const triggerService = createTriggerService(deps, { throttler });

export { triggersRouter } from "./routes";
