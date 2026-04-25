import { createFileRoute, Link } from "@tanstack/react-router"
import { ContactIcon, Plus } from "lucide-react"

import { CharacterTable } from "#/components/character/CharacterTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useCharacters } from "#/hooks/use-character"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/character/")({
  component: CharacterListPage,
})

function CharacterListPage() {
  const { data: items, isPending, error, refetch } = useCharacters()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<ContactIcon className="size-5" />}
        title={t("角色", "Characters")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个角色`, `${total} characters total`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("角色加载失败", "Failed to load characters")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有角色", "No characters yet")}
            description={t(
              "创建第一个角色,作为剧情对话和图鉴的基础。",
              "Create your first character as the basis for dialogues and collections.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/character/create">
                  <Plus />
                  {m.character_new()}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <CharacterTable data={items ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
