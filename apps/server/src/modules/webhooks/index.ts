/**
 * Webhooks module barrel.
 *
 * 事件接入由 lib/event-dispatcher.ts 统一处理 —— webhook 不再有自己的
 * event-bridge,跟 trigger 走同一条 queue producer 路径。
 */

import { deps } from "../../deps";
import { createWebhooksService } from "./service";

export { createWebhooksService };
export type { WebhooksService } from "./service";
export const webhooksService = createWebhooksService(deps);
export { webhooksRouter } from "./routes";
