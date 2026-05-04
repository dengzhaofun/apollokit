import { useTenantParams } from "#/hooks/use-tenant-params";
/**
 * Unauthorized landing page — shown when a user lands on a route they
 * lack permission for. Renders inside the dashboard layout so the
 * sidebar / breadcrumb stay intact.
 *
 * Triggers:
 *   - Direct URL paste to a route gated by `beforeLoad` that opted to
 *     redirect here instead of dashboard (e.g. mid-sensitive routes
 *     where we want to surface "you don't have access" rather than
 *     pretend the route doesn't exist).
 *   - Manual `navigate({ to: "/unauthorized", search: { from } })`
 *     from any guard.
 *
 * Owner / admin-management actions (transfer, delete org) silently
 * disable in the UI and are never linked here. This page is for
 * "operator hit a billing URL" type cases — explicit feedback + an
 * obvious way back.
 */
import { createFileRoute, useSearch, Link } from "@tanstack/react-router"
import { ShieldOffIcon } from "lucide-react"
import { z } from "zod"

import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty"
import { getLocale } from "#/paraglide/runtime.js"

const searchSchema = z.object({
  /** Originating path the user tried to reach. Surfaced for context. */
  from: z.string().optional(),
  /** Resource that was missing — surfaced as part of the explanation. */
  resource: z.string().optional(),
})

export const Route = createFileRoute("/_dashboard/unauthorized")({
  validateSearch: searchSchema,
  component: UnauthorizedPage,
})

function UnauthorizedPage() {
  const { from, resource } = useSearch({ from: "/_dashboard/unauthorized" })
  const isZh = getLocale() === "zh"
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <PageShell>
      <PageHeader
        icon={<ShieldOffIcon className="size-5" />}
        title={isZh ? "权限不足" : "Insufficient permissions"}
      />
      <PageBody>
        <Empty className="mx-auto max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldOffIcon className="size-4" />
            </EmptyMedia>
            <EmptyTitle>
              {isZh ? "你的角色没有访问该页面的权限" : "Your role can't open this page"}
            </EmptyTitle>
            <EmptyDescription>
              {isZh
                ? `请联系组织管理员申请权限${resource ? `（资源：${resource}）` : ""}${from ? `。原始链接：${from}` : ""}`
                : `Ask an organization admin to grant access${resource ? ` to ${resource}` : ""}${from ? `. Requested URL: ${from}` : ""}`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/dashboard" params={{ orgSlug, projectSlug }}>
                  {isZh ? "回到 Dashboard" : "Back to Dashboard"}
                </Link>
              }
              size="sm"
            />
          </EmptyContent>
        </Empty>
      </PageBody>
    </PageShell>
  )
}
