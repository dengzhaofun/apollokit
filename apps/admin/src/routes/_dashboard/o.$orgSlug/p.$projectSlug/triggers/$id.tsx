import { createFileRoute } from "@tanstack/react-router"

import { RuleEditor } from "#/components/triggers/RuleEditor"
import { useTriggerRule } from "#/hooks/use-triggers"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/triggers/$id")({
  component: EditTriggerRulePage,
})

function EditTriggerRulePage() {
  const { id } = Route.useParams()
  const { data: rule, isPending, error } = useTriggerRule(id)

  if (isPending) {
    return (
      <main className="flex-1 p-6 text-muted-foreground">
        {m.common_loading()}
      </main>
    )
  }
  if (error || !rule) {
    return (
      <main className="flex-1 p-6 text-destructive">
        {m.triggers_failed_load()} {error?.message}
      </main>
    )
  }
  return <RuleEditor rule={rule} />
}
