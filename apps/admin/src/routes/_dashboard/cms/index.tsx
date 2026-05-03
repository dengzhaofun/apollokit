import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { PageHeaderActions } from "#/components/PageHeader"
import { Can } from "#/components/auth/Can"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { useAllCmsTypes } from "#/hooks/use-cms"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/cms/")({
  component: CmsTypesPage,
})

function CmsTypesPage() {
  const { data: types, isPending, error } = useAllCmsTypes()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Can resource="cms" action="write" mode="disable">
            <Button
              render={
                <Link to="/cms/types/create">
                  <Plus className="size-4" />
                  {m.cms_type_new()}
                </Link>
              }
              size="sm"
            />
          </Can>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {error.message}
          </div>
        ) : !types || types.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-muted-foreground">
            <p>{m.cms_type_list_empty()}</p>
            <Can resource="cms" action="write" mode="disable">
              <Button
                render={
                  <Link to="/cms/types/create">
                    <Plus className="size-4" />
                    {m.cms_type_new()}
                  </Link>
                }
                size="sm" variant="outline"
              />
            </Can>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {types.map((t) => (
              <Link
                key={t.id}
                to="/cms/$typeAlias"
                params={{ typeAlias: t.alias }}
              >
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {t.alias}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 min-h-[2lh]">
                      {t.description ||
                        m.cms_type_no_description()}
                    </CardDescription>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {t.schema.fields.length} {m.cms_type_fields_count()}
                      </span>
                      <span>·</span>
                      <span>
                        {m.cms_type_schema_version()} v{t.schemaVersion}
                      </span>
                      {t.status === "archived" ? (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {m.cms_type_status_archived()}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
