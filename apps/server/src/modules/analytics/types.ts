import type { TenantPipeName } from "../../lib/analytics";

export const ALL_TENANT_PIPES: readonly TenantPipeName[] = [
  "tenant_request_overview",
  "tenant_event_counts",
  "tenant_trace",
  "tenant_event_names",
  "tenant_event_timeseries",
  "tenant_event_timeseries_fast",
  "tenant_event_funnel",
  "tenant_event_stream",
  "experiment_metric_breakdown",
  "tenant_dau_timeseries",
  "tenant_event_user_distribution",
  "tenant_user_active_days_distribution",
] as const;

export type { TenantPipeName };
