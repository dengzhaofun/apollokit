/**
 * 严格只读权限 —— `requireOrgManage` 的"GET 也卡角色"版本。
 *
 * 业务模块的 `requireOrgManage` 对 GET/HEAD 直接放行（owner/admin/member 都
 * 能读），写操作才检查角色。审计日志这类敏感视图不能这样：
 *   - 看见"谁动过 cdkey 批次"本身就泄露权限 / 操作意图，
 *   - 普通 member 的工作不需要看审计流水。
 *
 * 因此本 middleware 对所有 method（含 GET）都强制 owner/admin。
 *
 * 行为对齐 `requireOrgManage`：
 *   - 若 `c.var.authMethod === "admin-api-key"` 直接放行 —— admin API key 是
 *     被信任的运营凭证，已绑定 org，不在 member 表里。
 *   - 否则要求 session + active org，从 `member` 表读 role；member 角色 → 403。
 *
 * 必须挂在 `requireAdminOrApiKey` 之后（要 `c.var.user` / `c.var.session` /
 * `c.var.authMethod` 都已设置）。
 */

import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { db } from "../db";
import type { HonoEnv } from "../env";
import { fail } from "../lib/response";
import { member } from "../schema";

const FORBIDDEN_CODE = "forbidden";

export const requireOrgReadSensitive = createMiddleware<HonoEnv>(
  async (c, next) => {
    if (c.var.authMethod === "admin-api-key") {
      return next();
    }

    const userId = c.var.user?.id;
    const orgId = c.var.session?.activeOrganizationId;
    if (!userId || !orgId) {
      return c.json(
        fail(FORBIDDEN_CODE, "Sensitive read requires an authenticated session."),
        403,
      );
    }

    const [row] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
      .limit(1);

    if (!row || row.role === "member") {
      return c.json(
        fail(
          FORBIDDEN_CODE,
          "Your role does not have permission to view this resource.",
        ),
        403,
      );
    }

    await next();
  },
);
