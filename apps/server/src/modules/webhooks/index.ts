/**
 * Webhooks module barrel.
 *
 * Wires the service factory to the deps singleton and re-exports
 * everything routes / cron / other modules need.
 *
 * 注意：bridge 安装（installWebhookEventBridge）不在这里调用 —— 它依赖所有
 * module 的 registerEvent 已完成。由 src/index.ts 在 task forwarder 之后
 * 显式调用，保持装载顺序可控。
 */

import { deps } from "../../deps";
import { createWebhooksService } from "./service";

export { createWebhooksService };
export type { WebhooksService } from "./service";
export const webhooksService = createWebhooksService(deps);
export { webhooksRouter } from "./routes";
export { installWebhookEventBridge } from "./event-bridge";
export type { WebhookEventSink } from "./event-bridge";
