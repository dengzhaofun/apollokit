import { z } from "@hono/zod-openapi"

const ROLE_VALUES = [
  "owner",
  "admin",
  "operator",
  "viewer",
  "member",
] as const

export const TeamRoleSchema = z
  .string()
  .min(1)
  .max(64)
  .openapi({ example: "operator", description: "项目级角色名" })

export const ListTeamMembersQuerySchema = z.object({
  teamId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "teamId", in: "query" },
      example: "team_xxx",
      description: "项目 (= Better Auth team) 的 ID",
    }),
})

export const TeamMemberIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "teamMember 行 ID",
  }),
})

export const UpdateTeamMemberRoleBodySchema = z.object({
  role: TeamRoleSchema,
})

export const AddTeamMemberBodySchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: TeamRoleSchema.default("member"),
})

export const TeamMemberItemSchema = z
  .object({
    id: z.string(),
    teamId: z.string(),
    userId: z.string(),
    role: z.string(),
    createdAt: z.string().nullable(),
    user: z
      .object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
        image: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("TeamMemberItem")

export const TeamMemberListResponseSchema = z
  .object({
    items: z.array(TeamMemberItemSchema),
  })
  .openapi("TeamMemberListResponse")

// 不让 zod 抱怨 ROLE_VALUES 未使用
export type TeamRole = (typeof ROLE_VALUES)[number]
