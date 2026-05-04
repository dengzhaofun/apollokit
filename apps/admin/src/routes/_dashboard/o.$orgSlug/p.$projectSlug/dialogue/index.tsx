import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { MessagesSquareIcon, Plus } from "lucide-react"

import { ScriptTable } from "#/components/dialogue/ScriptTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { listSearchSchema } from "#/lib/list-search"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/dialogue/")({
  component: DialogueListPage,
  validateSearch: listSearchSchema.passthrough(),
})

function DialogueListPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <PageShell>
      <PageHeader
        icon={<MessagesSquareIcon className="size-5" />}
        title={t("对话脚本", "Dialogue scripts")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/dialogue/create" params={{ orgSlug, projectSlug }}>
                <Plus />
                {m.dialogue_new_script()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <PageBody>
        <ScriptTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
