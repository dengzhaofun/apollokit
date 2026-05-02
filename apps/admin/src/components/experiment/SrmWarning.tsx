import { AlertTriangle } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Alert, AlertDescription } from "#/components/ui/alert"
import type { SrmResult } from "#/lib/experiment-stats"
import * as m from "#/paraglide/messages.js"

interface Props {
  result: SrmResult
  /** Total sample size — used to suppress the warning when N is too small. */
  totalSample: number
}

const MIN_SAMPLE_FOR_SRM = 1000

/**
 * Top-of-panel warning shown when `detectSRM()` flags a chi-square
 * mismatch between observed and expected per-variant counts.
 *
 * Suppressed when `totalSample < MIN_SAMPLE_FOR_SRM` — chi-square's
 * false-positive rate gets noisy at small N, and frightening
 * operators with spurious warnings is worse than letting an early
 * mismatch slip past for one more day.
 */
export function SrmWarning({ result, totalSample }: Props) {
  if (!result.mismatch) return null
  if (totalSample < MIN_SAMPLE_FOR_SRM) return null

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        <div className="font-semibold">{m.experiment_srm_title()}</div>
        <p className="mt-1">
          {m.experiment_srm_body({
            chi: result.chiSquare.toFixed(2),
            p: result.pValue.toExponential(2),
          })}
        </p>
        <p className="mt-1 text-xs">
          {m.experiment_srm_action()}{" "}
          <Link
            to="/experiment/about-stats"
            className="font-medium underline"
          >
            {m.experiment_about_stats_link()}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  )
}
