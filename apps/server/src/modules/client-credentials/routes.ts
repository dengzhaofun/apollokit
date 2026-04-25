/**
 * Admin-facing HTTP routes for client credential management.
 *
 * Protected by `requireAdminOrApiKey` — accessible via session or admin
 * API key. These routes manage the publishable/secret key pairs that
 * C-end clients use for HMAC-authenticated requests.
 *
 * The secret is only returned on creation and rotation — list/get
 * endpoints never expose it.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
import { clientCredentialService } from "./index";
import {
  CreateCredentialSchema,
  CredentialCreatedResponseSchema,
  CredentialIdParamSchema,
  CredentialListResponseSchema,
  CredentialResponseSchema,
  RotateResponseSchema,
  UpdateDevModeSchema,
} from "./validators";

const TAG = "Client Credentials";

function serialize(row: {
  id: string;
  organizationId: string;
  name: string;
  publishableKey: string;
  devMode: boolean;
  enabled: boolean;
  expiresAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    publishableKey: row.publishableKey,
    devMode: row.devMode,
    enabled: row.enabled,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const clientCredentialRouter = createAdminRouter();

clientCredentialRouter.use("*", requireAdminOrApiKey);
clientCredentialRouter.use("*", requireOrgManage);

// POST /client-credentials — create
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/",
    tags: [TAG],
    summary: "Create a client credential for the current project",
    request: {
      body: {
        content: { "application/json": { schema: CreateCredentialSchema } },
      },
    },
    responses: {
      201: {
        description: "Created — secret is shown only once",
        content: {
          "application/json": { schema: envelopeOf(CredentialCreatedResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const result = await clientCredentialService.create(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok({
        id: result.id,
        name: result.name,
        publishableKey: result.publishableKey,
        secret: result.secret,
        devMode: result.devMode,
        enabled: result.enabled,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        createdAt: result.createdAt.toISOString(),
      }), 201,);
  },
);

// GET /client-credentials — list
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List client credentials for the current project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CredentialListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await clientCredentialService.list(orgId);
    return c.json(ok({ items: rows.map(serialize) }), 200);
  },
);

// GET /client-credentials/:id
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{id}",
    tags: [TAG],
    summary: "Get a client credential by ID",
    request: { params: CredentialIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CredentialResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await clientCredentialService.get(orgId, id);
    return c.json(ok(serialize(row)), 200);
  },
);

// POST /client-credentials/:id/revoke
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{id}/revoke",
    tags: [TAG],
    summary: "Disable a client credential (soft revoke)",
    request: { params: CredentialIdParamSchema },
    responses: {
      200: {
        description: "Revoked",
        content: { "application/json": { schema: envelopeOf(CredentialResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await clientCredentialService.revoke(orgId, id);
    return c.json(ok(serialize(row)), 200);
  },
);

// POST /client-credentials/:id/rotate
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{id}/rotate",
    tags: [TAG],
    summary: "Rotate keys — generates new publishable key + secret",
    request: { params: CredentialIdParamSchema },
    responses: {
      200: {
        description: "New keys — secret shown only once",
        content: { "application/json": { schema: envelopeOf(RotateResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const result = await clientCredentialService.rotate(orgId, id);
    return c.json(ok(result), 200);
  },
);

// PATCH /client-credentials/:id/dev-mode
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{id}/dev-mode",
    tags: [TAG],
    summary: "Toggle dev mode (skips HMAC verification when enabled)",
    request: {
      params: CredentialIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateDevModeSchema } },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: envelopeOf(CredentialResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { devMode } = c.req.valid("json");
    const row = await clientCredentialService.updateDevMode(orgId, id, devMode);
    return c.json(ok(serialize(row)), 200);
  },
);

// DELETE /client-credentials/:id
clientCredentialRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}",
    tags: [TAG],
    summary: "Permanently delete a client credential",
    request: { params: CredentialIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await clientCredentialService.delete(orgId, id);
    return c.json(ok(null), 200);
  },
);
