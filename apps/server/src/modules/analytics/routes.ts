
import { env } from "cloudflare:workers";
import { envelopeOf, ok } from "../../lib/response";

import { deps } from "../../deps";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import type { TenantPipeName } from "../../lib/analytics";
import { requireAuth } from "../../middleware/require-auth";

import {
  issueTokenBodySchema,
  issueTokenResponseSchema,
} from "./validators";

export const analyticsRouter = createAdminRouter();
analyticsRouter.use("*", requireAuth);

const issueTokenRoute = createAdminRoute({
  method: "post",
  path: "/token",
  tags: ["analytics"],
  summary: "Issue a short-lived Tinybird JWT scoped to this tenant",
  description:
    "Returns a JWT the admin UI can hand directly to Tinybird. The " +
    "`org_id` query parameter on each pipe is pinned in the token and " +
    "cannot be overridden by the client.",
  request: {
    body: {
      content: {
        "application/json": { schema: issueTokenBodySchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: envelopeOf(issueTokenResponseSchema) },
      },
      description: "Signed JWT",
    },
  },
});

analyticsRouter.openapi(issueTokenRoute, async (c) => {
  const session = c.get("session")!;
  const orgId = session.activeOrganizationId!;
  const { pipes, ttlSeconds } = c.req.valid("json");

  const token = await deps.analytics.signTenantToken(
    orgId,
    pipes.map((pipe) => ({ pipe: pipe as TenantPipeName })),
    { ttlSeconds },
  );

  const expiresAt = new Date(
    Date.now() + (ttlSeconds ?? 600) * 1000,
  ).toISOString();

  return c.json(ok({
      token,
      expiresAt,
      baseUrl: `${env.TINYBIRD_URL}/v0/pipes`,
      pipes,
    }), 200,);
});
