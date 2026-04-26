import { createFileRoute, Link } from "@tanstack/react-router"
import { ContactIcon, Plus } from "lucide-react"

import { CharacterTable } from "#/components/character/CharacterTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/character/")({
  component: CharacterListPage,
})

function CharacterListPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<ContactIcon className="size-5" />}
        title={t("角色", "Characters")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button asChild size="sm">
            <Link to="/character/create">
              <Plus />
              {m.character_new()}
            </Link>
          </Button>
        }
      />

      <PageBody>
        <CharacterTable />
      </PageBody>
    </PageShell>
  )
}
