import { useTenantParams } from "#/hooks/use-tenant-params";
/**
 * "About these statistics" — plain-language pedagogical page linked
 * from every (?) tooltip in the decision panel + SRM warning.
 *
 * Goals:
 *   - Explain p-value / confidence interval / SRM in plain Chinese
 *     (the tenant's primary language) using the coin-flip analogy
 *   - Anchor sections so tooltips can link directly: #p-value, #ci, #srm
 *   - Stay under one screen of reading on desktop
 *
 * Not aiming for stats textbook depth — links to external resources
 * for the curious.
 */

import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, BookOpen } from "lucide-react"

import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/experiment/about-stats")({
  component: AboutStatsPage,
})

function AboutStatsPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <PageShell>
      <PageHeader
        icon={<BookOpen className="size-5" />}
        title={m.experiment_about_stats_title()}
        description={m.experiment_about_stats_subtitle()}
        actions={
          <Button
            variant="outline"
            size="sm"
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/experiment" params={{ orgSlug, projectSlug }}>
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            }
          />
        }
      />
      <PageBody>
        <article className="prose prose-sm dark:prose-invert max-w-3xl space-y-6 text-sm">
          {/* p-value */}
          <section id="p-value" className="space-y-2 rounded-md border bg-card p-4">
            <h2 className="text-base font-semibold">
              {m.about_stats_pvalue_heading()}
            </h2>
            <p>{m.about_stats_pvalue_lead()}</p>
            <p className="text-muted-foreground">
              {m.about_stats_pvalue_coin()}
            </p>
            <p>{m.about_stats_pvalue_threshold()}</p>
          </section>

          {/* CI */}
          <section id="ci" className="space-y-2 rounded-md border bg-card p-4">
            <h2 className="text-base font-semibold">
              {m.about_stats_ci_heading()}
            </h2>
            <p>{m.about_stats_ci_lead()}</p>
            <p className="text-muted-foreground">
              {m.about_stats_ci_example()}
            </p>
          </section>

          {/* SRM */}
          <section id="srm" className="space-y-2 rounded-md border bg-card p-4">
            <h2 className="text-base font-semibold">
              {m.about_stats_srm_heading()}
            </h2>
            <p>{m.about_stats_srm_lead()}</p>
            <p className="text-muted-foreground">
              {m.about_stats_srm_action()}
            </p>
          </section>

          {/* Sample size */}
          <section className="space-y-2 rounded-md border bg-card p-4">
            <h2 className="text-base font-semibold">
              {m.about_stats_sample_heading()}
            </h2>
            <p>{m.about_stats_sample_lead()}</p>
          </section>

          <p className="text-xs text-muted-foreground">
            {m.about_stats_footer_disclaimer()}
          </p>
        </article>
      </PageBody>
    </PageShell>
  )
}
