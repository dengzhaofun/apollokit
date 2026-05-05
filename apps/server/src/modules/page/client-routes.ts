/**
 * C-end client routes for the page module.
 *
 * Mounted at `/api/v1/client/page`. Currently holds one endpoint:
 *
 *   POST /forms — `activity-form` block submission. Body identifies
 *                 which (projectId, pageId, blockId) the submission
 *                 belongs to. Service validates the project belongs
 *                 to the cred's tenantId before writing.
 *
 * Auth: `requireClientCredential` + `requireClientUser` (the standard
 * pair). End-user identity is required even on form submission so we
 * can attribute the row.
 *
 * Future endpoints (PR 6+): GET /by-slug/{slug} for the pages worker
 * to fetch a published project schema via service binding.
 */

import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { clientAuthHeaders } from "../../middleware/client-auth-headers";
import { pageService } from "./index";
import type { PageFormSubmission } from "./types";
import {
  PageFormSubmissionResponseSchema,
  SubmitFormSchema,
} from "./validators";

const TAG = "Page (Client)";

function serializeSubmission(row: PageFormSubmission) {
  return {
    id: row.id,
    projectId: row.projectId,
    pageId: row.pageId,
    blockId: row.blockId,
    endUserId: row.endUserId,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export const pageClientRouter = createClientRouter();

pageClientRouter.use("*", requireClientCredential);
pageClientRouter.use("*", requireClientUser);

pageClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/forms",
    tags: [TAG],
    summary: "Submit an activity-form block payload",
    request: {
      headers: clientAuthHeaders,
      body: {
        content: { "application/json": { schema: SubmitFormSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: envelopeOf(PageFormSubmissionResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const input = c.req.valid("json");
    const row = await pageService.appendFormSubmission(orgId, input.projectId, {
      pageId: input.pageId,
      blockId: input.blockId,
      endUserId,
      payload: input.payload,
    });
    return c.json(ok(serializeSubmission(row)), 201);
  },
);
