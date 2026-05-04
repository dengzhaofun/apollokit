import { ArrowRight, Check, Minus, Sparkles } from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"

import MarketingShell, {
  SectionEyebrow,
  SectionTitle,
} from "../landing/MarketingShell"
import {
  getCurrencyHint,
  getPricingFaq,
  getPricingMatrix,
  getPricingTiers,
  type MatrixRow,
  type Plan,
} from "../landing/pricing-plans"

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function PricingHero({
  billing,
  onBillingChange,
}: {
  billing: "monthly" | "annual"
  onBillingChange: (b: "monthly" | "annual") => void
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 ak-grid-bg" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 md:py-28">
        <SectionEyebrow>{m.pricing_hero_eyebrow()}</SectionEyebrow>
        <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
          {m.pricing_hero_h1_mau().split("").length > 0 && (
            <>
              按{" "}
              <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-transparent">
                {m.pricing_hero_h1_mau()}
              </span>{" "}
              {m.pricing_hero_h1_suffix()}
            </>
          )}
          <br />
          {m.pricing_hero_h1_free()}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {m.pricing_hero_desc()}
        </p>

        <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-border bg-background/60 p-1 text-sm backdrop-blur">
          <button
            type="button"
            onClick={() => onBillingChange("monthly")}
            className={
              "rounded-full px-4 py-1.5 transition-colors " +
              (billing === "monthly"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.pricing_hero_billing_monthly()}
          </button>
          <button
            type="button"
            onClick={() => onBillingChange("annual")}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors " +
              (billing === "annual"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.pricing_hero_billing_annual()}
            <span className="rounded-full bg-[var(--ak-accent-2)] px-1.5 py-0.5 text-[10px] font-black text-background">
              -20%
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{getCurrencyHint()}</p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tier cards                                                                */
/* -------------------------------------------------------------------------- */

function formatPrice(plan: Plan, billing: "monthly" | "annual") {
  if (plan.priceMonthly === "Custom" || plan.priceMonthly === "¥0") {
    return { main: plan.priceMonthly, note: plan.priceNote }
  }
  if (billing === "monthly") {
    return { main: plan.priceMonthly, note: plan.priceNote }
  }
  // Annual pricing — 20% off. Numbers like "¥299" or "¥1,299".
  const numeric = Number(plan.priceMonthly.replace(/[^\d]/g, ""))
  if (!numeric) return { main: plan.priceMonthly, note: plan.priceNote }
  const discounted = Math.round(numeric * 0.8)
  const formatted = discounted.toLocaleString("zh-CN")
  return {
    main: `¥${formatted}`,
    note: m.pricing_annual_price_note(),
  }
}

function TierCard({
  plan,
  billing,
}: {
  plan: Plan
  billing: "monthly" | "annual"
}) {
  const { main, note } = formatPrice(plan, billing)
  return (
    <div
      className={
        "relative flex flex-col rounded-2xl border p-7 transition-all " +
        (plan.highlighted
          ? "border-foreground/50 bg-card shadow-[0_40px_100px_-40px_var(--ak-glow-1)]"
          : "border-border bg-card/60")
      }
    >
      {plan.highlighted && (
        <>
          <div
            className="absolute -inset-px rounded-2xl"
            style={{
              background:
                "linear-gradient(180deg, var(--ak-glow-2), transparent 60%)",
              zIndex: -1,
            }}
            aria-hidden
          />
          <span className="absolute -top-2 right-6 rounded-full bg-[var(--ak-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
            {m.landing_pricing_recommended()}
          </span>
        </>
      )}

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {plan.id}
        </div>
        <h3 className="mt-1 text-2xl font-bold tracking-tight">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-4xl font-black tracking-tight">{main}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--ak-accent-2)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--ak-accent-2)]">
        <Sparkles className="size-3" />
        {plan.mauLabel}
      </div>

      <ul className="mt-6 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check
              className="mt-0.5 size-4 shrink-0 text-[var(--ak-accent-2)]"
              strokeWidth={2.5}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
        <Button
          render={
            <a href={plan.cta.href}>
              {plan.cta.label}
              <ArrowRight className="ml-1 size-4" />
            </a>
          }
          variant={plan.highlighted ? "default" : "outline"}
          className="w-full font-semibold"
          size="lg"
        />
      </div>
    </div>
  )
}

function TierGrid({ billing }: { billing: "monthly" | "annual" }) {
  const pricingTiers = getPricingTiers()
  return (
    <section className="relative py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((plan) => (
            <TierCard key={plan.id} plan={plan} billing={billing} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feature matrix                                                            */
/* -------------------------------------------------------------------------- */

function MatrixCell({ v }: { v: string | boolean }) {
  if (v === true) {
    return <Check className="mx-auto size-4 text-[var(--ak-accent-2)]" strokeWidth={2.5} />
  }
  if (v === false) {
    return <Minus className="mx-auto size-4 text-muted-foreground/40" />
  }
  return <span className="text-sm">{v}</span>
}

function FeatureMatrix() {
  const pricingTiers = getPricingTiers()
  const groupedRows = useMemo(() => {
    const matrix = getPricingMatrix()
    const groups: Record<string, MatrixRow[]> = {}
    for (const row of matrix) {
      groups[row.group] ??= []
      groups[row.group].push(row)
    }
    return Object.entries(groups)
  }, [])

  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <SectionEyebrow>{m.pricing_matrix_eyebrow()}</SectionEyebrow>
          <SectionTitle>
            <span className="mx-auto block">{m.pricing_matrix_title()}</span>
          </SectionTitle>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            {m.pricing_matrix_desc()}
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-3xl border border-border bg-card/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="sticky left-0 z-10 bg-background/80 px-5 py-4 text-left text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    {m.pricing_matrix_col_feature()}
                  </th>
                  {pricingTiers.map((p) => (
                    <th
                      key={p.id}
                      className={
                        "px-5 py-4 text-center text-sm font-bold tracking-tight " +
                        (p.highlighted ? "text-foreground" : "text-foreground/80")
                      }
                    >
                      <div>{p.name}</div>
                      <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                        {p.mauLabel}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(([group, rows]) => (
                  <Fragment key={group}>
                    <tr className="bg-background/30">
                      <td
                        colSpan={pricingTiers.length + 1}
                        className="px-5 py-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground"
                      >
                        {group}
                      </td>
                    </tr>
                    {rows.map((row) => (
                      <tr
                        key={`${group}-${row.label}`}
                        className="border-t border-border/50 hover:bg-background/40"
                      >
                        <td className="sticky left-0 z-10 bg-card/80 px-5 py-3 font-medium">
                          {row.label}
                        </td>
                        {pricingTiers.map((plan) => (
                          <td
                            key={plan.id}
                            className={
                              "px-5 py-3 text-center " +
                              (plan.highlighted ? "bg-background/30" : "")
                            }
                          >
                            <MatrixCell v={row.values[plan.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                       */
/* -------------------------------------------------------------------------- */

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const faqItems = getPricingFaq()
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center">
          <SectionEyebrow>{m.pricing_faq_eyebrow()}</SectionEyebrow>
          <SectionTitle>
            <span className="mx-auto block">{m.pricing_faq_title()}</span>
          </SectionTitle>
        </div>

        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card/60">
          {faqItems.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-background/40 focus:outline-none focus-visible:bg-background/40"
                >
                  <span className="font-semibold">{item.q}</span>
                  <span
                    className={
                      "ml-auto mt-1 inline-block size-5 shrink-0 rounded-full border text-center text-xs font-bold leading-[18px] transition-transform " +
                      (isOpen
                        ? "rotate-45 border-[var(--ak-accent-2)] text-[var(--ak-accent-2)]"
                        : "border-border text-muted-foreground")
                    }
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                <div
                  className={
                    "grid overflow-hidden px-6 text-sm leading-relaxed text-muted-foreground transition-all " +
                    (isOpen
                      ? "grid-rows-[1fr] pb-5"
                      : "grid-rows-[0fr]")
                  }
                >
                  <div className="min-h-0 overflow-hidden">{item.a}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                 */
/* -------------------------------------------------------------------------- */

function PricingCTA() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-background via-background to-card px-8 py-12 text-center shadow-[0_30px_80px_-30px_var(--ak-glow-1)] md:px-12 md:py-16">
          <div
            className="ak-glow"
            style={{
              top: "-30%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "60%",
              height: "70%",
              background: "var(--ak-glow-1)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {m.pricing_cta_h2()}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              {m.pricing_cta_desc()}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                render={
                  <a href="/auth/sign-up">
                    {m.pricing_cta_primary()}
                    <ArrowRight className="ml-1 size-4" />
                  </a>
                }
                size="lg"
                className="h-12 px-6 text-base font-semibold"
              />
              <Button
                render={<a href="mailto:sales@apollokit.dev">{m.pricing_cta_secondary()}</a>}
                variant="outline"
                size="lg"
                className="h-12 px-6 text-base"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly")

  return (
    <MarketingShell>
      <PricingHero billing={billing} onBillingChange={setBilling} />
      <TierGrid billing={billing} />
      <FeatureMatrix />
      <FAQ />
      <PricingCTA />
    </MarketingShell>
  )
}
