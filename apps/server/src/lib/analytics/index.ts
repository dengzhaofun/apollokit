/**
 * Analytics service — single entry point for the Worker runtime.
 *
 * Mirrors the shape of `src/lib/event-bus.ts` and `src/lib/storage/`:
 * a factory that returns a service object, which `src/deps.ts`
 * installs as `deps.analytics`.
 *
 * Two responsibilities:
 *   - `writer`        : ingest records into Tinybird
 *   - `signTenantToken`: produce a JWT the admin UI can send to
 *                        Tinybird directly (row-level security via
 *                        `fixed_params.org_id`)
 */

import { env } from "cloudflare:workers";
import { createTinybirdClient } from "../tinybird";
import {
  signTenantToken,
  type PipeGrant,
  type SignTenantTokenOptions,
} from "./jwt";
import { createAnalyticsWriter, type AnalyticsWriter } from "./writer";

export type AnalyticsService = {
  writer: AnalyticsWriter;
  signTenantToken: (
    orgId: string,
    grants: PipeGrant[],
    opts?: SignTenantTokenOptions,
  ) => Promise<string>;
};

export function createAnalyticsService(): AnalyticsService {
  // Eagerly fail if the Worker is missing the secrets — better than
  // a cryptic 401 from Tinybird later. Workers wrapped by the lazy
  // Proxy in deps.ts only pay this cost on first access.
  const token = env.TINYBIRD_TOKEN;
  const baseUrl = env.TINYBIRD_URL;
  const workspaceId = env.TINYBIRD_WORKSPACE_ID;
  if (!token || !baseUrl || !workspaceId) {
    throw new Error(
      "Tinybird not configured: TINYBIRD_TOKEN / TINYBIRD_URL / TINYBIRD_WORKSPACE_ID must be set",
    );
  }

  const client = createTinybirdClient({ token, baseUrl });

  return {
    writer: createAnalyticsWriter(client),
    signTenantToken: (orgId, grants, opts) =>
      signTenantToken({ signingKey: token, workspaceId }, orgId, grants, opts),
  };
}

export type {
  HttpRequestRecord,
  BusinessEventRecord,
  AnalyticsActor,
  AnalyticsOutcome,
  TenantPipeName,
} from "./types";
export type { PipeGrant, SignTenantTokenOptions } from "./jwt";
