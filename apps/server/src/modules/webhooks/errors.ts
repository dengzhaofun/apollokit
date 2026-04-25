/**
 * Typed errors for the webhooks module.
 *
 * Service methods throw these instead of returning `{ error }` objects.
 * The router factory's `onError` in `lib/openapi.ts` maps them to the
 * standard envelope with the correct HTTP status and code.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class WebhookEndpointNotFound extends ModuleError {
  constructor(id: string) {
    super("webhooks.endpoint_not_found", 404, `webhook endpoint not found: ${id}`);
    this.name = "WebhookEndpointNotFound";
  }
}

export class WebhookDeliveryNotFound extends ModuleError {
  constructor(id: string) {
    super("webhooks.delivery_not_found", 404, `webhook delivery not found: ${id}`);
    this.name = "WebhookDeliveryNotFound";
  }
}

export class WebhookLimitExceeded extends ModuleError {
  constructor(limit: number) {
    super(
      "webhooks.limit_exceeded",
      409,
      `webhook endpoint limit reached for this project (max ${limit})`,
    );
    this.name = "WebhookLimitExceeded";
  }
}

export class WebhookInvalidInput extends ModuleError {
  constructor(message: string) {
    super("webhooks.invalid_input", 400, message);
    this.name = "WebhookInvalidInput";
  }
}
