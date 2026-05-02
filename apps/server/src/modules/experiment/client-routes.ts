/**
 * Client routes for the experiment module.
 *
 * Mounted at `/api/client/experiment/*`. Auth pattern matches other
 * client modules:
 *   requireClientCredential — validates `cpk_…` x-api-key, populates orgId
 *   requireClientUser       — validates x-end-user-id + x-user-hash HMAC
 *
 * Surface (v1):
 *   POST /evaluate   — given experiment_keys, return current variants
 *
 * Exposure event emission lives inside `service.evaluate` (gated on the
 * `(xmax = 0)` upsert flag) so the analytics writer sees exactly one
 * `experiment.exposure` per (experiment, endUser).
 */

import { createClientRoute, createClientRouter } from "../../lib/openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getClientOrgId, getEndUserId } from "../../lib/route-context";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { experimentService } from "./index";
import {
  EvaluateRequestSchema,
  EvaluateResponseSchema,
} from "./validators";

const TAG = "Experiment (Client)";

export const experimentClientRouter = createClientRouter();

experimentClientRouter.use("*", requireClientCredential);
experimentClientRouter.use("*", requireClientUser);

experimentClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/evaluate",
    tags: [TAG],
    summary:
      "Evaluate one or more experiments for the current end user. Sticky bucketing — same user always gets the same variant per experiment.",
    request: {
      body: {
        content: { "application/json": { schema: EvaluateRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(EvaluateResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getClientOrgId(c);
    const endUserId = getEndUserId(c);
    const { experiment_keys, attributes } = c.req.valid("json");

    // Server-derived attributes from CF Workers headers. SDK-supplied
    // values OVERRIDE these on conflict (tenant business knowledge
    // beats geo-IP guess, and lets the SDK spoof for QA).
    const serverAttrs: Record<string, unknown> = {};
    const country = c.req.header("cf-ipcountry");
    if (country) serverAttrs.country = country;
    const userAgent = c.req.header("user-agent");
    if (userAgent) serverAttrs.userAgent = userAgent;

    const merged = { ...serverAttrs, ...(attributes ?? {}) };

    const results = await experimentService.evaluate(
      orgId,
      endUserId,
      experiment_keys,
      merged,
    );
    return c.json(ok({ results }), 200);
  },
);
