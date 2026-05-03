import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BadgeNodeForm } from "#/components/badge/BadgeNodeForm"
import { BadgeTemplatePicker } from "#/components/badge/BadgeTemplatePicker"
import { useBadgeNodeForm } from "#/components/badge/use-node-form"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
  useBadgeNodes,
  useBadgeTemplates,
  useCreateBadgeNode,
  useCreateBadgeNodeFromTemplate,
} from "#/hooks/use-badge"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/badge/create")({
  component: BadgeCreatePage,
})

function BadgeCreatePage() {
  const navigate = useNavigate()
  const { data: existing } = useBadgeNodes()
  const { data: templates = [] } = useBadgeTemplates()
  const createMutation = useCreateBadgeNode()
  const fromTemplateMutation = useCreateBadgeNodeFromTemplate()
  const [tab, setTab] = useState<"template" | "custom">("template")

  const existingKeys = (existing ?? []).map((n) => n.key)

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/badge">
              <ArrowLeft className="size-4" />
              {m.badge_back_to_list()}
            </Link>
          }
          variant="ghost" size="sm"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "template" | "custom")}>
            <TabsList>
              <TabsTrigger value="template">
                {m.badge_tab_template()}
              </TabsTrigger>
              <TabsTrigger value="custom">{m.badge_tab_custom()}</TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="mt-4">
              <BadgeTemplatePicker
                templates={templates}
                existingKeys={existingKeys}
                isPending={fromTemplateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    const row = await fromTemplateMutation.mutateAsync(values)
                    toast.success(m.badge_created())
                    navigate({
                      to: "/badge/$nodeId",
                      params: { nodeId: row.id },
                    })
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.badge_failed_create())
                  }
                }}
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-4">
              <CustomBadgePanel
                existingKeys={existingKeys}
                isPending={createMutation.isPending}
                onSave={async (values) => {
                  try {
                    const row = await createMutation.mutateAsync(values)
                    toast.success(m.badge_created())
                    navigate({
                      to: "/badge/$nodeId",
                      params: { nodeId: row.id },
                    })
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.badge_failed_create())
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  )
}

function CustomBadgePanel({
  existingKeys,
  isPending,
  onSave,
}: {
  existingKeys: string[]
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useBadgeNodeForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useBadgeNodeForm({ onSubmit: onSave })
  return (
    <BadgeNodeForm
      form={form}
      existingKeys={existingKeys}
      isPending={isPending}
      submitLabel={m.common_create()}
    />
  )
}
