import { createFileRoute } from "@tanstack/react-router"
import { MailCheck } from "lucide-react"

import { EndUserVerificationTable } from "#/components/end-user/EndUserVerificationTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { listSearchSchema } from "#/lib/list-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/end-user-verification/",
)({
  validateSearch: listSearchSchema.passthrough(),
  component: EndUserVerificationPage,
})

function EndUserVerificationPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<MailCheck className="size-5" />}
        title={t("邮件验证", "Verifications")}
        description={t(
          "查看当前项目待处理的邮件验证记录和密码重置 token。",
          "View pending email verification records and password reset tokens for this project.",
        )}
      />
      <PageBody>
        <EndUserVerificationTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
