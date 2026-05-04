/**
 * 项目级成员管理 admin 路由 —— `/api/v1/team-members/*`。
 *
 * 这些路由站在"组织级管理面"上(列出/变更/移除项目成员),所以鉴权用
 * `requireTenantSessionOrApiKey` + `requireOrgPermission("orgMember", ...)`。
 *
 * 操作的是 team_member 表(Better Auth 内置),Better Auth client SDK
 * 不暴露 listTeamMembers,所以 admin 前端直接 fetch 这些 endpoint。
 */
import { createAdminRoute, createAdminRouter } from "../../lib/openapi"
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response"
import { getOrgScopedCompanyId } from "../../lib/route-context"
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key"
import { requireOrgPermission } from "../../middleware/require-org-permission"

import { teamMemberService } from "./index"
import type { TeamMemberWithUser } from "./types"
import {
  AddTeamMemberBodySchema,
  ListTeamMembersQuerySchema,
  TeamMemberIdParamSchema,
  TeamMemberItemSchema,
  TeamMemberListResponseSchema,
  UpdateTeamMemberRoleBodySchema,
} from "./validators"

const TAG = "TeamMembers"

function serialize(row: TeamMemberWithUser) {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    user: row.user,
  }
}

export const teamMemberRouter = createAdminRouter()

teamMemberRouter.use("*", requireTenantSessionOrApiKey)

// 写操作集中网关:invite / remove(变更角色复用 invite 权限)
const writeGuard = requireOrgPermission("orgMember", "invite")

teamMemberRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "列出指定项目的成员",
    request: { query: ListTeamMembersQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(TeamMemberListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgScopedCompanyId(c)
    const { teamId } = c.req.valid("query")
    const rows = await teamMemberService.list({ organizationId, teamId })
    return c.json(ok({ items: rows.map(serialize) }), 200)
  },
)

teamMemberRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/",
    tags: [TAG],
    summary: "把已存在的组织成员加入到项目",
    middleware: [writeGuard],
    request: {
      body: {
        content: { "application/json": { schema: AddTeamMemberBodySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(TeamMemberItemSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgScopedCompanyId(c)
    const body = c.req.valid("json")
    const row = await teamMemberService.add({
      organizationId,
      teamId: body.teamId,
      userId: body.userId,
      role: body.role,
    })
    return c.json(ok(serialize(row)), 201)
  },
)

teamMemberRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{id}",
    tags: [TAG],
    summary: "变更项目成员角色",
    middleware: [writeGuard],
    request: {
      params: TeamMemberIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateTeamMemberRoleBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(TeamMemberItemSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgScopedCompanyId(c)
    const { id } = c.req.valid("param")
    const { role } = c.req.valid("json")
    const row = await teamMemberService.updateRole({
      organizationId,
      teamMemberId: id,
      role,
    })
    return c.json(ok(serialize(row)), 200)
  },
)

teamMemberRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}",
    tags: [TAG],
    summary: "把成员从项目移除",
    middleware: [requireOrgPermission("orgMember", "remove")],
    request: { params: TeamMemberIdParamSchema },
    responses: {
      200: {
        description: "Removed",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgScopedCompanyId(c)
    const { id } = c.req.valid("param")
    await teamMemberService.remove({
      organizationId,
      teamMemberId: id,
    })
    return c.json(ok(null), 200)
  },
)
