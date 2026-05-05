import type { PageProjectSchema } from "@repo/page-blocks/schema";

/**
 * Static fixture used during PR 3 to prove the SSR pipeline works
 * end-to-end without hitting the database. The pages worker renders
 * this for any slug == "demo" (or as the catch-all default in dev).
 *
 * Real data loading lands in PR 4 / 5 — `loadProject()` will switch
 * from this fixture to a service-binding fetch + KV cache.
 */
export const DEMO_PROJECT_FIXTURE: PageProjectSchema = {
  version: 1,
  theme: {
    primary: "#FF6B35",
    bg: "#0b0b10",
    fg: "#ffffff",
    mode: "dark",
  },
  pages: [
    {
      id: "home",
      path: "/",
      title: "Spring Check-in Bonanza",
      seo: {
        description:
          "Sign in 7 days in a row to claim an exclusive avatar.",
      },
      blocks: [
        {
          id: "hero-1",
          type: "hero",
          props: {
            title: "Spring Check-in Bonanza",
            subtitle:
              "Sign in 7 days in a row to claim an exclusive avatar.",
            ctaLabel: "Start now",
            ctaHref: "#start",
          },
        },
        {
          id: "fg-1",
          type: "feature-grid",
          props: {
            heading: "How it works",
            items: [
              {
                title: "Open daily",
                description: "Visit this page once a day.",
                icon: "📅",
              },
              {
                title: "Earn streaks",
                description: "Hit 7 days in a row for a bonus.",
                icon: "🔥",
              },
              {
                title: "Redeem rewards",
                description: "Items appear in your inventory.",
                icon: "🎁",
              },
            ],
            columns: 3,
          },
        },
        {
          id: "footer-1",
          type: "footer",
          props: {
            brandName: "Apollo Game Studio",
            tagline: "Made with care.",
            copyrightYear: 2026,
          },
        },
      ],
    },
  ],
  defaultPageId: "home",
};
