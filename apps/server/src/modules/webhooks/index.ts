/**
 * Webhooks module barrel.
 *
 * Wires the service factory to the deps singleton and re-exports
 * everything routes / cron / other modules need.
 */

import { deps } from "../../deps";
import { createWebhooksService } from "./service";

export { createWebhooksService };
export type { WebhooksService } from "./service";
export const webhooksService = createWebhooksService(deps);
export { webhooksRouter } from "./routes";
