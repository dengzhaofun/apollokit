import { createFileRoute } from "@tanstack/react-router"

import { RuleEditor } from "#/components/triggers/RuleEditor"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/triggers/new")({
  component: NewTriggerRulePage,
})

function NewTriggerRulePage() {
  return <RuleEditor />
}
