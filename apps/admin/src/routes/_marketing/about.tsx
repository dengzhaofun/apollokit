import { createFileRoute } from "@tanstack/react-router"
import * as m from "../../paraglide/messages.js"

export const Route = createFileRoute("/_marketing/about")({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <p className="island-kicker mb-3">About</p>
        <h1 className="display-title mb-5 text-4xl font-bold tracking-tight text-[var(--sea-ink)]">
          {m.marketing_about_title()}
        </h1>
        <p className="text-[var(--sea-ink-soft)]">
          {m.marketing_about_description()}
        </p>
      </section>
    </main>
  )
}
