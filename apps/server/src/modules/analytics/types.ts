import type { TenantPipeName } from "../../lib/analytics";

export const ALL_TENANT_PIPES: readonly TenantPipeName[] = [
  "tenant_request_overview",
  "tenant_event_counts",
  "tenant_trace",
] as const;

export type { TenantPipeName };
