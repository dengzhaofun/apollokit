/**
 * Admin-side TypeScript shapes for the webhooks module.
 *
 * Mirrors the server's response envelopes in
 * `apps/server/src/modules/webhooks/validators.ts`. Kept flat and hand-
 * written (no codegen) so the UI package stays decoupled from server
 * internals — if the server ever splits off, only this file moves.
 */

export type WebhookEndpointStatus = "active" | "disabled" | "paused_failing"

export type WebhookDeliveryStatus =
  | "pending"
  | "in_flight"
  | "success"
  | "failed"
  | "dead"

export interface WebhookEndpoint {
  id: string
  organizationId: string
  name: string
  url: string
  description: string | null
  eventTypes: string[]
  secretHint: string
  status: WebhookEndpointStatus
  consecutiveFailures: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  disabledAt: string | null
  createdAt: string
  updatedAt: string
}

/** Response from POST /endpoints and POST /endpoints/:id/rotate-secret. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** Plaintext `whsec_…`. Shown only once by the server. */
  secret: string
}

export interface CreateWebhookEndpointInput {
  name: string
  url: string
  description?: string | null
  eventTypes?: string[]
}

export interface UpdateWebhookEndpointInput {
  name?: string
  url?: string
  description?: string | null
  eventTypes?: string[]
  status?: "active" | "disabled"
}

export interface WebhookDelivery {
  id: string
  organizationId: string
  endpointId: string
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attemptCount: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  lastAttemptedAt: string | null
  succeededAt: string | null
  failedAt: string | null
  createdAt: string
}
