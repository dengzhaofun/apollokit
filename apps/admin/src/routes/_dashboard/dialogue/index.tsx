import { createFileRoute, Link } from "@tanstack/react-router"
import { MessagesSquareIcon, Plus } from "lucide-react"

import { ScriptTable } from "#/components/dialogue/ScriptTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/dialogue/")({
  component: DialogueListPage,
})

function DialogueListPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<MessagesSquareIcon className="size-5" />}
        title={t("对话脚本", "Dialogue scripts")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button asChild size="sm">
            <Link to="/dialogue/create">
              <Plus />
              {m.dialogue_new_script()}
            </Link>
          </Button>
        }
      />

      <PageBody>
        <ScriptTable />
      </PageBody>
    </PageShell>
  )
}
