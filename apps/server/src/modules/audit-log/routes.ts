/**
 * Audit-log admin routes —— 挂在 `/api/audit-logs`。
 *
 * 鉴权栈：`requireAdminOrApiKey` → `requireOrgReadSensitive`（owner/admin
 * 才能看；member 直接 403，与其他业务模块的 `requireOrgManage` 行为不同
 * 因为审计是敏感读）。
 *
 * **没有 mutation 端点**。本表是 append-only，写入完全由
 * `middleware/audit-log.ts` 在所有其他业务请求结束后异步完成。
 */

import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgReadSensitive } from "../../middleware/require-org-read-sensitive";

import { auditLogService } from "./index";
import {
  AuditLogIdParamSchema,
  AuditLogListResponseSchema,
  AuditLogViewSchema,
  ListAuditLogsQuerySchema,
  ResourceTypesResponseSchema,
} from "./validators";

const TAG = "Audit Log";

export const auditLogRouter = createAdminRouter();

auditLogRouter.use("*", requireAdminOrApiKey);
auditLogRouter.use("*", requireOrgReadSensitive);

auditLogRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List audit log entries for the current org (cursor-paginated)",
    request: { query: ListAuditLogsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(AuditLogListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const query = c.req.valid("query");
    const page = await auditLogService.list(orgId, query);
    return c.json(ok(page), 200);
  },
);

auditLogRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/resource-types",
    tags: [TAG],
    summary:
      "List distinct resource types that have appeared in audit logs for this org. Used by the admin filter UI.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(ResourceTypesResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const items = await auditLogService.listResourceTypes(orgId);
    return c.json(ok({ items }), 200);
  },
);

auditLogRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{id}",
    tags: [TAG],
    summary: "Get a single audit log entry by id",
    request: { params: AuditLogIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AuditLogViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const view = await auditLogService.get(orgId, id);
    return c.json(ok(view), 200);
  },
);
