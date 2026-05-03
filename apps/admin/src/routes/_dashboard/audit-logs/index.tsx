/**
 * 审计日志列表页 —— 跨所有模块的横切视图。
 *
 * 数据走 `useAuditLogs` → server `GET /api/v1/audit-logs`。所有 URL state
 * （cursor / pageSize / search / filter / advanced AST）由 `useListSearch`
 * 接管，刷新 / 分享 / 浏览器后退都自动还原。
 */
import { createFileRoute } from "@tanstack/react-router"
import { ScrollText } from "lucide-react"
import { z } from "zod"

import { AuditLogTable } from "#/components/audit-logs/AuditLogTable"
import { RouteGuard } from "#/components/auth/RouteGuard"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { listSearchSchema } from "#/lib/list-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

/**
 * URL 参数白名单 —— 与 server `auditLogFilters` 的 query schema 对齐。
 * 显式列出每个 key 而非 `passthrough()`，让拼错的 key 走 zod 校验失败而非
 * 静默落到查询里。
 */
const auditLogFilterSchema = z
  .object({
    actorType: z.enum(["user", "admin-api-key", "system"]).optional(),
    actorId: z.string().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    action: z.string().optional(),
    method: z.string().optional(),
    statusGte: z.coerce.number().optional(),
    statusLte: z.coerce.number().optional(),
    tsGte: z.string().optional(),
    tsLte: z.string().optional(),
  })
  .passthrough()

export const Route = createFileRoute("/_dashboard/audit-logs/")({
  validateSearch: listSearchSchema.merge(auditLogFilterSchema).passthrough(),
  component: AuditLogsPage,
})

function AuditLogsPage() {
  // Audit log is admin/owner only — sidebar already hides it for the
  // other roles, but a URL paste shouldn't render the page either.
  // `redirect-dashboard` matches the visibility declared in
  // `AppSidebar.tsx`'s ROUTE_PERMISSIONS for /audit-logs.
  return (
    <RouteGuard resource="auditLog" action="read" visibility="redirect-dashboard">
      <PageShell>
        <PageHeader
          icon={<ScrollText className="size-5" />}
          title={t("审计日志", "Audit logs")}
          description={t(
            "记录所有管理员对业务资源的写操作，跨所有模块按时间线呈现。",
            "Append-only record of every admin write across all modules.",
          )}
        />
        <PageBody>
          <AuditLogTable route={Route} />
        </PageBody>
      </PageShell>
    </RouteGuard>
  )
}
