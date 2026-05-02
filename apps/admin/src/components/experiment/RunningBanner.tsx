import { Pause } from "lucide-react"

import { Alert, AlertDescription } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"

/**
 * Inline alert shown above the variant table when an experiment is
 * running. Tells the operator that variant / traffic edits are locked
 * and offers a one-click "pause to edit" action.
 */
export function RunningBanner({ onPause }: { onPause: () => void }) {
  return (
    <Alert className="border-brand/40 bg-brand-soft/40">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{m.experiment_running_banner()}</span>
        <Button size="sm" variant="outline" onClick={onPause}>
          <Pause className="size-3.5" />
          {m.experiment_action_pause()}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
