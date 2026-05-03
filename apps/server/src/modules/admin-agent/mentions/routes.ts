/**
 * Mention routes — two endpoints under `/api/ai/admin/mentions/*`.
 *
 *   GET /types               — registry of mentionable types (for UI tabs)
 *   GET /search              — searches resources, optionally filtered by type
 *
 * Same auth contract as the chat endpoint: `requireAuth` resolves the
 * Better Auth session and active organization id; descriptor.search /
 * fetch are always called with that org id, so cross-tenant access is
 * impossible by construction.
 *
 * Like `routes.ts` (the chat endpoint), this router bypasses the
 * `OpenAPIHono` envelope machinery — the AI panel calls these via raw
 * fetch, not via the generated SDK.
 */

import { Hono } from "hono";

import type { HonoEnv } from "../../../env";
import { requireAuth } from "../../../middleware/require-auth";
import { getMention, listMentions } from "./registry";

export const mentionsRouter = new Hono<HonoEnv>();
mentionsRouter.use("*", requireAuth);

/**
 * GET /types — list registered mention types.
 *
 * The frontend pulls this once when the AI panel mounts and uses it to
 * render the popover's type tabs and to validate the `types=` filter
 * sent on `/search`. Adding a new descriptor to the registry instantly
 * appears here — frontend needs no code change.
 */
mentionsRouter.get("/types", (c) => {
  const types = listMentions().map((d) => ({
    type: d.type,
    label: d.label,
    /** True if mentioning this type also enables write operations. */
    writable: d.toolModuleId != null,
  }));
  return c.json({ types });
});

/**
 * GET /search?types=check-in,task&q=七日&limit=10 — searches resources.
 *
 *   - `types` (optional): comma-separated list of mention types. Defaults
 *     to all registered types.
 *   - `q` (optional): substring filter on name/alias. Empty/omitted →
 *     each descriptor returns its default recommendations (most-recent N).
 *   - `limit` (optional, default 8, max 25): per-type cap.
 *
 * Results are merged across types. Per-type ordering is whatever the
 * descriptor returns; cross-type ordering is whatever interleaving the
 * iteration produces (deterministic but not relevance-ranked — first
 * iteration goal is correctness, not ranking).
 */
mentionsRouter.get("/search", async (c) => {
  const tenantId = c.var.session?.activeTeamId;
  if (!tenantId) {
    return c.json({ error: "no_active_organization" }, 400);
  }

  const url = new URL(c.req.url);
  const typesParam = url.searchParams.get("types");
  const q = url.searchParams.get("q") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = clampLimit(limitRaw ? Number(limitRaw) : undefined);

  const requestedTypes = typesParam
    ? typesParam.split(",").map((t) => t.trim()).filter(Boolean)
    : null;
  const descriptors = requestedTypes
    ? requestedTypes
        .map((t) => getMention(t))
        .filter((d): d is NonNullable<typeof d> => d != null)
    : listMentions();

  if (descriptors.length === 0) {
    return c.json({ results: [] });
  }

  // Run all type searches in parallel. A descriptor that throws is
  // demoted to "no results" so one bad module can't break the whole
  // popover — log so we can find it later.
  const settled = await Promise.allSettled(
    descriptors.map((d) => d.search(tenantId, q, limit)),
  );
  const results = settled.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(
      `[mentions] descriptor "${descriptors[i]?.type}" search failed:`,
      r.reason,
    );
    return [];
  });

  return c.json({ results });
});

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
function clampLimit(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(n);
}
