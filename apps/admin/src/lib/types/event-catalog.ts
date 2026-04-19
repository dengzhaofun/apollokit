export type EventFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "unknown"

export interface EventFieldRow {
  path: string
  type: EventFieldType
  description?: string
  required: boolean
}

export type EventCatalogSource = "internal" | "external"
export type EventCatalogStatus = "inferred" | "canonical"

export interface CatalogEventView {
  name: string
  source: EventCatalogSource
  owner: string | null
  description: string | null
  fields: EventFieldRow[]
  /** null for internal, 'inferred' | 'canonical' for external. */
  status: EventCatalogStatus | null
  lastSeenAt: string | null
  sampleEventData: Record<string, unknown> | null
  forwardToTask: boolean
}

export interface CatalogListResponse {
  items: CatalogEventView[]
}

export interface UpdateEventCatalogInput {
  description?: string | null
  fields?: EventFieldRow[]
}
