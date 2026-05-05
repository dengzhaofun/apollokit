/**
 * json-render catalog for the page-blocks library.
 *
 * The catalog is the **single source of truth** for what AI can put
 * inside a `BlockNode.props`. Each entry's `props` zod schema bounds
 * the data the LLM may emit; the `description` is what the model reads
 * to choose the right block.
 *
 * Architecture note: our `PageProjectSchema` (see `./schema.ts`) is
 * *outer* — it controls pages/theme/navigation/auth gating. Each
 * block's `props` is a *json-render spec* — controlled by THIS catalog.
 * The `PageRenderer` in `./registry.tsx` walks the outer schema and
 * defers each block's render to json-render's `<Renderer />` with the
 * matching catalog entry.
 *
 * Adding a new block:
 *   1. Add a React component under `./components/<name>.tsx` exporting
 *      `<Name>` and `<name>PropsSchema`.
 *   2. Register it here under `components` with the catalog id (the
 *      string AI emits as `BlockNode.type`).
 *   3. Add a matching entry in `./registry.tsx` `componentRegistry`.
 *   4. (Optional) Add AI metadata in `./ai-metadata.ts` for richer
 *      `whenToUse` / examples than the catalog `description` provides.
 *   5. (Optional) Add a binding declaration in `./bindings.ts` if the
 *      block needs to call a server module at SSR time.
 */

import { defineCatalog } from "@json-render/core";
import { schema as reactSchema } from "@json-render/react/schema";

import { activityFormPropsSchema } from "./components/activity-form.js";
import { authFormPropsSchema } from "./components/auth-form.js";
import { badgeWallPropsSchema } from "./components/badge-wall.js";
import { cdkeyRedeemPropsSchema } from "./components/cdkey-redeem.js";
import { checkInBoardPropsSchema } from "./components/check-in-board.js";
import { featureGridPropsSchema } from "./components/feature-grid.js";
import { footerPropsSchema } from "./components/footer.js";
import { heroPropsSchema } from "./components/hero.js";
import { leaderboardCardPropsSchema } from "./components/leaderboard-card.js";
import { lotteryWheelPropsSchema } from "./components/lottery-wheel.js";
import { mailInboxPropsSchema } from "./components/mail-inbox.js";
import { shopGridPropsSchema } from "./components/shop-grid.js";

export const catalog = defineCatalog(reactSchema, {
  components: {
    /* ─── Marketing (no module binding) ─────────────────────────── */

    hero: {
      props: heroPropsSchema,
      description:
        "Above-the-fold marketing hero — large headline, optional subtitle, optional CTA button, optional background image. Use as the first block on a landing page to establish the campaign.",
    },

    "feature-grid": {
      props: featureGridPropsSchema,
      description:
        "3-6 image+text cards in a grid. Use to highlight selling points, activity perks, or 'how to participate' steps. Each card has a title, optional description, and optional icon.",
    },

    footer: {
      props: footerPropsSchema,
      description:
        "Page footer with brand line, optional link list, and legal/copyright text. Always last block. ICP filings or address go in the `legal` field.",
    },

    /* ─── Auth (no module binding — talks to end-user-auth) ────── */

    "auth-form": {
      props: authFormPropsSchema,
      description:
        "End-user sign-in / sign-up form (email + password + optional magic link). Use only when the project's authMode is platform_auth. Posts to /api/auth/sign-in/email which the pages worker proxies to the server's end-user Better Auth instance.",
    },

    /* ─── Game-module bound blocks ──────────────────────────── */

    "check-in-board": {
      props: checkInBoardPropsSchema,
      description:
        "7 / 14 / 30-day daily check-in board. Each cell shows the day's reward and claim status; the bottom CTA posts to /api/v1/client/check-in/claim. Bound module: check-in.",
    },

    "shop-grid": {
      props: shopGridPropsSchema,
      description:
        "Card grid of purchasable items from a shop config. Each card has name / image / price / buy button. Bound module: shop. Specify `shopId` to bind a particular shop.",
    },

    "lottery-wheel": {
      props: lotteryWheelPropsSchema,
      description:
        "Lottery / gacha block with prize pool preview + a single Spin button. Optional pull-history strip below. Bound module: lottery. Specify `lotteryId` to target a configured pool.",
    },

    "cdkey-redeem": {
      props: cdkeyRedeemPropsSchema,
      description:
        "Single-input CDKey redemption form. Pure HTML form — no JS required. Bound module: cdkey. Optional `campaignId` filters which keys are accepted.",
    },

    "leaderboard-card": {
      props: leaderboardCardPropsSchema,
      description:
        "Top-N leaderboard with optional 'your rank' callout when the player is outside the top N. Bound module: leaderboard. Specify `leaderboardId` and `topN` (default 10).",
    },

    "mail-inbox": {
      props: mailInboxPropsSchema,
      description:
        "End-user mail inbox: list of messages with optional reward attachments + per-mail Claim button + optional bulk Claim-all CTA. Bound module: mail.",
    },

    "activity-form": {
      props: activityFormPropsSchema,
      description:
        "Operator-defined form (entry / questionnaire / sweepstakes signup). Operator declares fields by id+type+label; the runtime renders inputs and posts to /api/v1/client/page/forms which writes to page_form_submissions. Field types: text, textarea, email, select, checkbox.",
    },

    "badge-wall": {
      props: badgeWallPropsSchema,
      description:
        "Achievement / badge wall. Pure display — no claim button. Earned badges show full opacity; unearned ones are dimmed. Optional tier hint (bronze/silver/gold/platinum) drives the medal gradient. Bound module: badge.",
    },
  },

  // No catalog-level actions yet. Block-level interactivity (sign-in,
  // submit, click-through) is handled by HTML form posts + plain links
  // for SSR-safety. Catalog `actions` come back when we wire generative
  // game-module blocks (check-in claim, lottery pull) in PR 5 — those
  // need imperative handlers.
  actions: {},
});

/**
 * All catalog component ids — used for cross-ref validation. Maintained
 * by hand because the json-render `Catalog` instance doesn't expose its
 * registered component-id list as a public field. The catalog.test.ts
 * suite asserts this set matches the actual `defineCatalog` call so the
 * two stay in sync.
 */
export const CATALOG_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "hero",
  "feature-grid",
  "footer",
  "auth-form",
  "check-in-board",
  "shop-grid",
  "lottery-wheel",
  "cdkey-redeem",
  "leaderboard-card",
  "mail-inbox",
  "activity-form",
  "badge-wall",
] as const);

/** Type of a single block's spec the renderer expects. */
export type BlockSpec = (typeof catalog)["_specType"];

/**
 * Cached zod schema for the catalog's spec. The agent-side
 * `proposePageDraft` tool can use this as part of its tool input
 * schema definition.
 */
let cachedSchema: ReturnType<typeof catalog.zodSchema> | null = null;
export function blockSpecSchema(): ReturnType<typeof catalog.zodSchema> {
  if (!cachedSchema) cachedSchema = catalog.zodSchema();
  return cachedSchema;
}
