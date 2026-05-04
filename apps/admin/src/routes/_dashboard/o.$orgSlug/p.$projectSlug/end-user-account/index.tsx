import { createFileRoute } from "@tanstack/react-router"
import { KeyRound } from "lucide-react"

import { EndUserAccountTable } from "#/components/end-user/EndUserAccountTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { listSearchSchema } from "#/lib/list-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/end-user-account/",
)({
  validateSearch: listSearchSchema.passthrough(),
  component: EndUserAccountPage,
})

function EndUserAccountPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<KeyRound className="size-5" />}
        title={t("认证账号", "Auth Accounts")}
        description={t(
          "查看当前项目所有玩家绑定的认证方式（邮箱密码 / OAuth）。",
          "View all authentication accounts linked by players in this project.",
        )}
      />
      <PageBody>
        <EndUserAccountTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
