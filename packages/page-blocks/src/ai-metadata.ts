/**
 * Per-block AI metadata — richer than the catalog's one-line `description`.
 *
 * The pages-builder agent (apps/server) builds its system prompt by
 * concatenating `description` (from catalog) + `whenToUse` + `examples`
 * for every block. Examples are tiny ready-to-emit `BlockNode.props`
 * fragments so the model can copy-modify rather than hallucinate.
 *
 * Keep it terse. The model has a finite system-prompt budget and we
 * register all blocks at once. Two short example props per block is
 * usually enough.
 */

import type { BlockNode } from "./schema.js";

export interface AIBlockMetadata {
  /** Catalog component id (matches `BlockNode.type`). */
  type: string;
  /** Short human-readable category for grouping in the prompt. */
  category: "marketing" | "auth" | "module";
  /**
   * One paragraph telling the model when to choose this block over
   * alternatives. Phrased as guidance, not constraints (zod handles
   * constraints).
   */
  whenToUse: string;
  /**
   * Tiny `BlockNode` examples (with realistic `props`) for few-shot
   * prompting. The agent inlines these in the system prompt.
   */
  examples: Array<Pick<BlockNode, "type" | "props">>;
}

export const aiMetadata: Record<string, AIBlockMetadata> = {
  hero: {
    type: "hero",
    category: "marketing",
    whenToUse:
      "Always the first block on the home page. Use it to set the campaign headline and the primary call-to-action. If the project has multiple pages, repeat a hero on each landing page with the page-specific message.",
    examples: [
      {
        type: "hero",
        props: {
          title: "Daily Check-in Bonanza",
          subtitle: "Sign in 7 days in a row for an exclusive avatar.",
          ctaLabel: "Claim today's reward",
          ctaHref: "#check-in",
        },
      },
      {
        type: "hero",
        props: {
          title: "Spring Festival Shop",
          subtitle: "Exclusive items, limited time.",
          align: "center",
        },
      },
    ],
  },
  "feature-grid": {
    type: "feature-grid",
    category: "marketing",
    whenToUse:
      "Use to show 3–6 selling points or a 'how it works' explainer. Each item is a small icon + title + 1–2 sentence description. If you need more than 6 items, prefer a different layout — a wall of cards loses impact.",
    examples: [
      {
        type: "feature-grid",
        props: {
          heading: "How it works",
          items: [
            { title: "Sign in daily", description: "Open the page once a day.", icon: "📅" },
            { title: "Earn streaks", description: "Hit 7 days for a bonus.", icon: "🔥" },
            { title: "Redeem rewards", description: "Items appear in your inventory.", icon: "🎁" },
          ],
          columns: 3,
        },
      },
    ],
  },
  footer: {
    type: "footer",
    category: "marketing",
    whenToUse:
      "Always the last block on every page. Carries brand line, link list (optional), and any legal/regulatory text the operator needs (ICP filings, copyright). If the operator doesn't provide brand/legal copy, use the project name as brandName and omit the legal field.",
    examples: [
      {
        type: "footer",
        props: {
          brandName: "Apollo Game Studio",
          tagline: "Made with care.",
          links: [
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
          ],
        },
      },
    ],
  },
  "auth-form": {
    type: "auth-form",
    category: "auth",
    whenToUse:
      "Only valid when the project's authMode is 'platform_auth'. Place on a dedicated /login page or as a gated section above other interactive blocks. Do NOT use on anonymous or hmac_external projects — those modes don't go through Better Auth.",
    examples: [
      {
        type: "auth-form",
        props: {
          title: "Sign in to claim",
          subtitle: "Use the email you registered with.",
          defaultMode: "sign-in",
          enableMagicLink: true,
        },
      },
    ],
  },
  "check-in-board": {
    type: "check-in-board",
    category: "module",
    whenToUse:
      "Use for daily-active campaigns. Pair with a `hero` above and a `feature-grid` (how-it-works) for first-time visitors. The block displays a 7 / 14 / 30-day cycle and posts to /api/v1/client/check-in/claim. Set `binding.module: 'check-in'` on the BlockNode.",
    examples: [
      {
        type: "check-in-board",
        props: {
          heading: "7 days, 7 rewards",
          cycleLength: 7,
          ctaLabel: "Claim today's reward",
        },
      },
    ],
  },
  "shop-grid": {
    type: "shop-grid",
    category: "module",
    whenToUse:
      "Use to surface a configured shop. Always specify `shopId` so the loader binds to one specific shop config. Best when you have 6-12 items; for very large catalogs prefer multiple grids segmented by category.",
    examples: [
      {
        type: "shop-grid",
        props: {
          heading: "Spring shop",
          shopId: "spring-2026",
          columns: 3,
        },
      },
    ],
  },
  "lottery-wheel": {
    type: "lottery-wheel",
    category: "module",
    whenToUse:
      "Use for one-shot gacha campaigns. Show prize tease + a single Spin CTA. Combine with `hero` above. Specify `lotteryId` to bind one configured pool; multiple pools on the same page should each have their own block.",
    examples: [
      {
        type: "lottery-wheel",
        props: {
          heading: "Spring Wheel",
          lotteryId: "spring-wheel-2026",
          costLabel: "1 spin = 100 gold",
        },
      },
    ],
  },
  "cdkey-redeem": {
    type: "cdkey-redeem",
    category: "module",
    whenToUse:
      "Use for partner / influencer campaigns where the page's purpose is exactly 'enter your code'. Place under a hero. The form posts to /api/v1/client/cdkey/redeem. Optional `campaignId` filters which keys are accepted.",
    examples: [
      {
        type: "cdkey-redeem",
        props: {
          heading: "Have a code?",
          intro: "Enter the code from your influencer's video below.",
          inputPlaceholder: "SPRING-XXXX-YYYY",
          ctaLabel: "Redeem",
        },
      },
    ],
  },
  "leaderboard-card": {
    type: "leaderboard-card",
    category: "module",
    whenToUse:
      "Use to surface a competitive leaderboard. Always specify `leaderboardId`. Default `topN` is 10 — bump to 20+ only when the audience is small enough that scrolling won't drown the rest of the page.",
    examples: [
      {
        type: "leaderboard-card",
        props: {
          heading: "Spring Trial — Top 10",
          leaderboardId: "spring-2026-arena",
          topN: 10,
          scoreLabel: "Score",
        },
      },
    ],
  },
  "mail-inbox": {
    type: "mail-inbox",
    category: "module",
    whenToUse:
      "Use on dashboards / hub pages where players check what they've received. Set `showClaimAll: true` for high-volume reward campaigns; otherwise per-mail Claim is enough.",
    examples: [
      {
        type: "mail-inbox",
        props: {
          heading: "Mail",
          showClaimAll: true,
        },
      },
    ],
  },
  "activity-form": {
    type: "activity-form",
    category: "module",
    whenToUse:
      "Use to collect operator-defined entries (signups / contest entries / questionnaires). Each field gets an id (becomes the JSON key in payload) + type. Field types: text, textarea, email, select, checkbox. Submitted rows live in page_form_submissions and the operator can browse them in admin.",
    examples: [
      {
        type: "activity-form",
        props: {
          heading: "Spring giveaway",
          intro: "Tell us where to ship your prize.",
          fields: [
            { id: "name", type: "text", label: "Full name", required: true },
            { id: "email", type: "email", label: "Email", required: true },
            { id: "address", type: "textarea", label: "Mailing address" },
            {
              id: "size",
              type: "select",
              label: "T-shirt size",
              options: [
                { value: "s", label: "Small" },
                { value: "m", label: "Medium" },
                { value: "l", label: "Large" },
              ],
            },
            {
              id: "agree",
              type: "checkbox",
              label: "I agree to the terms",
              required: true,
            },
          ],
          ctaLabel: "Enter giveaway",
        },
      },
    ],
  },
  "badge-wall": {
    type: "badge-wall",
    category: "module",
    whenToUse:
      "Pure display block for player achievements. Best on dashboard / profile pages, not on the home hero. `earnedOnly: true` hides unearned badges; otherwise the dim-grayscale fallback shows progression. Bound module: badge.",
    examples: [
      {
        type: "badge-wall",
        props: {
          heading: "Achievements",
          columns: 4,
        },
      },
    ],
  },
};

export function getBlockMetadata(type: string): AIBlockMetadata | undefined {
  return aiMetadata[type];
}

/**
 * Render the entire registered metadata as a markdown block ready to
 * be embedded in an LLM system prompt. Used by the agent's
 * `listAvailableBlocks` tool.
 */
export function renderAIMetadataMarkdown(types: readonly string[]): string {
  const lines: string[] = [];
  for (const t of types) {
    const m = aiMetadata[t];
    if (!m) continue;
    lines.push(`### \`${m.type}\` (${m.category})`);
    lines.push(m.whenToUse);
    if (m.examples.length > 0) {
      lines.push("Examples:");
      for (const ex of m.examples) {
        lines.push(
          "```json\n" + JSON.stringify(ex, null, 2) + "\n```",
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
