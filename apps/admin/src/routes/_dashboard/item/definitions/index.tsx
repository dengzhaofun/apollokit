import { createFileRoute, Link } from "@tanstack/react-router"
import { PackageIcon, Plus } from "lucide-react"

import { DefinitionTable } from "#/components/item/DefinitionTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { useItemDefinitions } from "#/hooks/use-item"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/item/definitions/")({
  component: ItemDefinitionsPage,
})

function ItemDefinitionsPage() {
  const { data: definitions, isPending, error, refetch } = useItemDefinitions()
  const total = definitions?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<PackageIcon className="size-5" />}
        title={t("物品定义", "Item definitions")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个定义`, `${total} definitions total`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("物品定义加载失败", "Failed to load definitions")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有物品定义", "No item definitions yet")}
            description={t(
              "创建第一个物品定义,后续 shop / reward / inventory 都基于它。",
              "Create your first definition to power shop / reward / inventory.",
            )}
            action={
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
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <DefinitionTable data={definitions ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
