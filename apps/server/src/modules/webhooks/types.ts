import type {
  webhooksDeliveries,
  webhooksEndpoints,
} from "../../schema/webhooks";

export const ENDPOINT_STATUSES = [
  "active",
  "disabled",
  "paused_failing",
] as const;
export type EndpointStatus = (typeof ENDPOINT_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "pending",
  "in_flight",
  "success",
  "failed",
  "dead",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type WebhooksEndpoint = typeof webhooksEndpoints.$inferSelect;
export type WebhooksDelivery = typeof webhooksDeliveries.$inferSelect;

/**
 * Public-shape endpoint — strips `secret_ciphertext`, keeps `secret_hint`.
 * The plaintext secret is returned ONLY from create / rotate-secret.
 */
export type WebhooksEndpointView = Omit<WebhooksEndpoint, "secretCiphertext">;

export type DispatchInput = {
  tenantId: string;
  /**
   * Caller-supplied event id. Must be unique per event so receivers can
   * deduplicate across retries. If omitted, service mints a UUID.
   */
  eventId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  /**
   * Override the `created_at` timestamp stamped into the outbound body.
   * Mainly for testing / replay of historical events.
   */
  occurredAt?: Date;
};
