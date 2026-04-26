import { createFileRoute, Link } from "@tanstack/react-router"
import { PackageIcon, Plus } from "lucide-react"

import { DefinitionTable } from "#/components/item/DefinitionTable"
import {
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/item/definitions/")({
  component: ItemDefinitionsPage,
})

function ItemDefinitionsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<PackageIcon className="size-5" />}
        title={t("物品定义", "Item definitions")}
        description={t(
          "shop / reward / inventory 都基于物品定义。",
          "Definitions back the shop, rewards, and inventory.",
        )}
        actions={
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/item/definitions/create">
                <Plus />
                {m.item_new_definition()}
              </Link>
            </Button>
          </WriteGate>
        }
      />

      <PageBody>
        <DefinitionTable />
      </PageBody>
    </PageShell>
  )
}
