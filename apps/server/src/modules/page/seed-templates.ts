/**
 * Seed the `page_templates` table with the MVP catalog of official
 * templates the operator can pick from when creating a new project.
 *
 * Idempotent — `pageService.upsertTemplate` upserts on slug. Run
 * during deploy or via `pnpm --filter=server tsx scripts/seed-page-templates.ts`
 * (script not added to package.json yet — call from a one-off shell
 * for now).
 *
 * Each template's `schema` is hand-written to be a coherent starting
 * point: complete enough to render on first paint, with placeholder
 * copy the operator obviously needs to replace. The agent uses the
 * template as a v1 baseline and iterates from there.
 */

import { pageService } from "./index";
import type { PageProjectSchema } from "./types";

interface OfficialTemplate {
  slug: string;
  name: string;
  description: string;
  category:
    | "checkin"
    | "shop"
    | "lottery"
    | "redeem"
    | "leaderboard"
    | "event"
    | "marketing"
    | "other";
  requiredModules: string[];
  sortOrder: number;
  schema: PageProjectSchema;
}

const baseTheme: PageProjectSchema["theme"] = {
  primary: "#FF6B35",
  bg: "#0b0b10",
  fg: "#ffffff",
  mode: "dark",
};

function commonFooter(brand = "Apollo Game Studio") {
  return {
    id: "footer",
    type: "footer",
    props: {
      brandName: brand,
      tagline: "Made with care.",
    },
  } as const;
}

const TEMPLATES: OfficialTemplate[] = [
  {
    slug: "daily-checkin-promo",
    name: "Daily Check-in Bonanza",
    description:
      "7-day check-in cycle with hero, how-it-works grid, and a footer. The classic D1/D7 retention page.",
    category: "checkin",
    requiredModules: ["check-in"],
    sortOrder: 10,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Daily Check-in Bonanza",
          seo: {
            description:
              "Sign in 7 days in a row to claim an exclusive avatar.",
          },
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Daily Check-in Bonanza",
                subtitle:
                  "Sign in 7 days in a row to claim an exclusive avatar.",
                ctaLabel: "Claim today",
                ctaHref: "#claim",
              },
            },
            {
              id: "how-it-works",
              type: "feature-grid",
              props: {
                heading: "How it works",
                items: [
                  {
                    title: "Sign in daily",
                    description: "Open the page once a day.",
                    icon: "📅",
                  },
                  {
                    title: "Earn streaks",
                    description: "Hit 7 days in a row for the bonus.",
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
              id: "checkin",
              type: "check-in-board",
              props: {
                heading: "7 days, 7 rewards",
                cycleLength: 7,
                ctaLabel: "Claim today's reward",
              },
              binding: { module: "check-in" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "seasonal-shop",
    name: "Seasonal Shop",
    description:
      "Hero + featured shop grid. For limited-time merchandise drops.",
    category: "shop",
    requiredModules: ["shop"],
    sortOrder: 20,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Spring Shop",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Spring Shop",
                subtitle: "Exclusive items for a limited time.",
                ctaLabel: "Shop now",
                ctaHref: "#shop",
              },
            },
            {
              id: "shop",
              type: "shop-grid",
              props: {
                heading: "Featured items",
                shopId: "REPLACE_ME",
                columns: 3,
              },
              binding: { module: "shop" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "lottery-spin",
    name: "Lottery Spin",
    description:
      "Lottery wheel campaign — hero + prize tease + spin form.",
    category: "lottery",
    requiredModules: ["lottery"],
    sortOrder: 30,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Spring Wheel",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Spring Wheel",
                subtitle: "Spin daily for a shot at the grand prize.",
              },
            },
            {
              id: "wheel",
              type: "lottery-wheel",
              props: {
                heading: "Spin to win",
                lotteryId: "REPLACE_ME",
                costLabel: "1 spin = 100 gold",
              },
              binding: { module: "lottery" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "cdkey-redeem-simple",
    name: "CDKey Redeem (Simple)",
    description:
      "Single-purpose code redemption page — hero + redeem form. Best for influencer campaigns.",
    category: "redeem",
    requiredModules: ["cdkey"],
    sortOrder: 40,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Redeem your code",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Have a code?",
                subtitle:
                  "Enter the code from your favourite creator below.",
              },
            },
            {
              id: "redeem",
              type: "cdkey-redeem",
              props: {
                inputPlaceholder: "SPRING-XXXX-YYYY",
                ctaLabel: "Redeem",
              },
              binding: { module: "cdkey" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "leaderboard-arena",
    name: "Leaderboard Arena",
    description:
      "Top-N leaderboard with hero context. Use for tournaments / seasonal arenas.",
    category: "leaderboard",
    requiredModules: ["leaderboard"],
    sortOrder: 50,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Spring Arena",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Spring Arena",
                subtitle: "Top 10 take home exclusive cosmetics.",
              },
            },
            {
              id: "ranks",
              type: "leaderboard-card",
              props: {
                heading: "Live rankings",
                leaderboardId: "REPLACE_ME",
                topN: 10,
              },
              binding: { module: "leaderboard" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "marketing-hero-only",
    name: "Marketing Hero",
    description:
      "Pure marketing — hero + 3-card features + footer. No game module bindings; safe for any project.",
    category: "marketing",
    requiredModules: [],
    sortOrder: 60,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Coming soon",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Something exciting is coming",
                subtitle: "Sign up to be the first to know.",
                ctaLabel: "Notify me",
                ctaHref: "#notify",
              },
            },
            {
              id: "features",
              type: "feature-grid",
              props: {
                heading: "What to expect",
                items: [
                  { title: "New gameplay", icon: "🎮" },
                  { title: "Exclusive rewards", icon: "🎁" },
                  { title: "Limited time", icon: "⏰" },
                ],
                columns: 3,
              },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "achievement-wall",
    name: "Achievement Wall",
    description:
      "Player-facing badge collection page. Pure display — no claim flow. Best on hub / profile pages.",
    category: "other",
    requiredModules: ["badge"],
    sortOrder: 70,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Your achievements",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Your achievements",
                subtitle:
                  "Every milestone you've earned in one place.",
                align: "center",
              },
            },
            {
              id: "badges",
              type: "badge-wall",
              props: {
                heading: "Badges",
                columns: 4,
              },
              binding: { module: "badge" },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
  {
    slug: "event-signup",
    name: "Event Signup",
    description:
      "Hero + activity-form (name/email/optional fields). Use for tournament registration, beta signups, etc.",
    category: "event",
    requiredModules: ["activity"],
    sortOrder: 80,
    schema: {
      version: 1,
      theme: baseTheme,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Event signup",
          blocks: [
            {
              id: "hero",
              type: "hero",
              props: {
                title: "Sign up for the spring tournament",
                subtitle: "Limited slots — first come first served.",
              },
            },
            {
              id: "form",
              type: "activity-form",
              props: {
                heading: "Reserve your spot",
                fields: [
                  {
                    id: "name",
                    type: "text",
                    label: "Display name",
                    required: true,
                  },
                  {
                    id: "email",
                    type: "email",
                    label: "Email",
                    required: true,
                  },
                  {
                    id: "agree",
                    type: "checkbox",
                    label: "I agree to the tournament rules.",
                    required: true,
                  },
                ],
                ctaLabel: "Reserve spot",
              },
            },
            commonFooter(),
          ],
        },
      ],
      defaultPageId: "home",
    },
  },
];

/**
 * Idempotent seed — call once at deploy time, or from a one-off shell:
 *   pnpm --filter=server tsx -e 'import("./src/modules/page/seed-templates").then(m => m.seedOfficialTemplates())'
 */
export async function seedOfficialTemplates(): Promise<{
  upserted: number;
}> {
  let upserted = 0;
  for (const tpl of TEMPLATES) {
    await pageService.upsertTemplate({
      slug: tpl.slug,
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      schema: tpl.schema,
      requiredModules: tpl.requiredModules,
      isOfficial: true,
      sortOrder: tpl.sortOrder,
    });
    upserted += 1;
  }
  return { upserted };
}

/** Exposed for tests so the test fixture can assert template content
 *  without depending on DB state. */
export { TEMPLATES as OFFICIAL_PAGE_TEMPLATES };
