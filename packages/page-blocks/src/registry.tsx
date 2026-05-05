/**
 * React registry — maps catalog ids to actual React implementations,
 * plus the high-level `PageRenderer` that walks an entire
 * `PageProjectSchema` and emits an SSR-safe React tree.
 *
 * Two layers:
 *
 *   1. `componentRegistry` is a json-render `defineRegistry` instance
 *      that the lower-level `<Renderer />` uses to render a single
 *      block's spec.
 *   2. `<PageRenderer />` is our wrapper that walks the outer
 *      `PageProjectSchema` (theme / pages / blocks / authGate) and
 *      defers each block to `<Renderer />`. The outer walk is what
 *      json-render doesn't do for us — it knows nothing about pages,
 *      themes, or auth gating.
 *
 * SSR contract: `PageRenderer` is fully synchronous-renderable. Async
 * data loading happens earlier — the pages worker resolves SSR loaders
 * before render, then injects the materialised data via `loaderData`.
 * Hydration is identical because both server and client read from the
 * same `loaderData` map. No mismatch sources here.
 */

import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  type RendererProps,
} from "@json-render/react";
import * as React from "react";

import { CATALOG_BLOCK_TYPES, catalog } from "./catalog.js";
import { ActivityForm } from "./components/activity-form.js";
import { AuthForm } from "./components/auth-form.js";
import { AuthGate } from "./components/auth-gate.js";
import { BadgeWall } from "./components/badge-wall.js";
import { CdkeyRedeem } from "./components/cdkey-redeem.js";
import { CheckInBoard } from "./components/check-in-board.js";
import { FeatureGrid } from "./components/feature-grid.js";
import { Footer } from "./components/footer.js";
import { Hero } from "./components/hero.js";
import { LeaderboardCard } from "./components/leaderboard-card.js";
import { LotteryWheel } from "./components/lottery-wheel.js";
import { MailInbox } from "./components/mail-inbox.js";
import { ShopGrid } from "./components/shop-grid.js";
import type {
  BlockNode,
  PageNode,
  PageProjectSchema,
  ThemeTokens,
} from "./schema.js";

// ─── Component registry (catalog id → React component) ────────────

const registryDef = defineRegistry(catalog, {
  components: {
    hero: ({ props }) => <Hero {...props} />,
    "feature-grid": ({ props }) => <FeatureGrid {...props} />,
    footer: ({ props }) => <Footer {...props} />,
    "auth-form": ({ props }) => <AuthForm {...props} />,
    "check-in-board": ({ props }) => <CheckInBoard {...props} />,
    "shop-grid": ({ props }) => <ShopGrid {...props} />,
    "lottery-wheel": ({ props }) => <LotteryWheel {...props} />,
    "cdkey-redeem": ({ props }) => <CdkeyRedeem {...props} />,
    "leaderboard-card": ({ props }) => <LeaderboardCard {...props} />,
    "mail-inbox": ({ props }) => <MailInbox {...props} />,
    "activity-form": ({ props }) => <ActivityForm {...props} />,
    "badge-wall": ({ props }) => <BadgeWall {...props} />,
  },
  // PR 5: game-module blocks bind via the `BlockNode.binding` field;
  // their data is fetched by the pages worker SSR loader before
  // render and passed in as `initialData`. The catalog has no
  // imperative actions yet — every interaction is a plain HTML
  // form post the pages worker / server proxies as normal.
  actions: {},
});

export const componentRegistry = registryDef.registry;

// ─── Theme → CSS variables ────────────────────────────────────────

/**
 * Build a CSS-variable style block from theme tokens. Render it on the
 * page root so every block's `var(--page-primary)` / `var(--page-bg)` /
 * `var(--page-fg)` reference resolves to the project's theme without
 * each block having to import the tokens.
 */
function themeToCssVars(theme: ThemeTokens): React.CSSProperties {
  // We strip the alpha because background/foreground are stored as
  // hex strings; if the caller passes rgba() they go through unchanged.
  const fg = theme.fg;
  const bg = theme.bg;
  const primary = theme.primary;
  // Pick a contrasting foreground for primary buttons. Keep it dumb:
  // if primary looks dark (most short hex codes) use white, else
  // black. This is a heuristic — operators can override via settings
  // when we surface that in admin UI.
  const primaryFg = pickReadableForeground(primary);

  return {
    // CSS-in-JS — React passes through `--xx` keys verbatim, treated
    // as custom properties by the browser.
    ["--page-bg" as string]: bg,
    ["--page-fg" as string]: fg,
    ["--page-primary" as string]: primary,
    ["--page-primary-fg" as string]: primaryFg,
    backgroundColor: bg,
    color: fg,
    fontFamily: theme.fontBody ?? "system-ui, -apple-system, sans-serif",
  };
}

function pickReadableForeground(color: string): string {
  // Crude luminance check — only handles short hex (#abc / #aabbcc).
  // RGBA / oklch / hsl all default to white. Good enough for v1.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "#ffffff";
  let hex = m[1] ?? "";
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // ITU-R BT.601 perceived luminance.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#0b0b10" : "#ffffff";
}

// ─── Block renderer ───────────────────────────────────────────────

/**
 * Map a `BlockNode` to a json-render spec and render it. Unknown types
 * render an inline error stub instead of throwing — never break SSR
 * because of a stale schema referencing a removed block type.
 *
 * json-render's `Renderer` expects a `{ root, elements: { [id]: { type,
 * props, children } } }` tree, not a single `{ type, props }` object.
 * Each block becomes a one-element tree (no nesting).
 */
export function BlockRenderer(props: { block: BlockNode }) {
  const { block } = props;
  // `catalog` is referenced indirectly via registry — keep the import
  // pinned so module side effects (zod registration) run.
  void catalog;
  const known = CATALOG_BLOCK_TYPES.has(block.type);
  if (!known) {
    return (
      <div
        role="alert"
        className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        data-block="unknown"
        data-block-type={block.type}
      >
        Unknown block type: <code>{block.type}</code>
      </div>
    );
  }

  const spec = {
    root: block.id,
    elements: {
      [block.id]: {
        type: block.type,
        props: block.props,
        children: [],
      },
    },
  };

  return (
    <Renderer
      spec={spec as unknown as RendererProps["spec"]}
      registry={componentRegistry}
    />
  );
}

// ─── Page renderer ────────────────────────────────────────────────

export interface PageRendererContext {
  /**
   * Whether the current end user is authenticated. Used by `AuthGate`
   * wrappers around blocks that have `authGate: "requireUser"`.
   *   - `true` — render gated blocks
   *   - `false` — render the auth-gate fallback (sign-in stub)
   *   - `null` — pre-resolution placeholder; should be rare on SSR
   */
  signedIn: boolean | null;
}

const DEFAULT_CONTEXT: PageRendererContext = { signedIn: true };

/**
 * Render a single page from a `PageProjectSchema`. Both the pages
 * worker (SSR) and the admin preview iframe call this. The
 * `JSONUIProvider` is mounted once at the top so any future
 * action-bound block (PR 5+) gets the dispatcher.
 */
export function PageRenderer(props: {
  schema: PageProjectSchema;
  pageId?: string;
  context?: PageRendererContext;
}) {
  const ctx = props.context ?? DEFAULT_CONTEXT;
  const targetId = props.pageId ?? props.schema.defaultPageId;
  const page = props.schema.pages.find((p) => p.id === targetId);

  if (!page) {
    return (
      <div role="alert" className="px-6 py-12 text-sm">
        Unknown page: <code>{targetId}</code>
      </div>
    );
  }

  return (
    <JSONUIProvider registry={componentRegistry} handlers={{}}>
      <main
        className="min-h-screen"
        style={themeToCssVars(props.schema.theme)}
        data-page={page.id}
        data-page-path={page.path}
      >
        {page.blocks.map((block) => (
          <BlockSlot key={block.id} block={block} signedIn={ctx.signedIn} />
        ))}
      </main>
    </JSONUIProvider>
  );
}

function BlockSlot(props: { block: BlockNode; signedIn: boolean | null }) {
  const { block, signedIn } = props;
  const inner = <BlockRenderer block={block} />;
  if (block.authGate === "requireUser") {
    return (
      <AuthGate signedIn={signedIn}>
        {inner}
      </AuthGate>
    );
  }
  return inner;
}

/**
 * Convenience SSR helper for callers that just want HTML. The pages
 * worker uses TanStack Start's own `renderToReadableStream` for the
 * real SSR — this is for tests / prerender prototypes.
 */
export function getPageMetadata(
  schema: PageProjectSchema,
  pageId?: string,
): { title: string; description?: string; ogImage?: string } | null {
  const page = schema.pages.find((p) => p.id === (pageId ?? schema.defaultPageId));
  if (!page) return null;
  return {
    title: page.title,
    description: page.seo?.description,
    ogImage: page.seo?.ogImage ?? schema.seo?.defaultOgImage,
  };
}

// ─── Convenience helpers ──────────────────────────────────────────

/**
 * Iterate every block in the schema. Used by tests, the SSR
 * pre-fetch pass in the pages worker, and bindings introspection.
 */
export function* iterateBlocks(
  schema: PageProjectSchema,
): Generator<{ page: PageNode; block: BlockNode }> {
  for (const page of schema.pages) {
    for (const block of page.blocks) {
      yield { page, block };
    }
  }
}

export { Renderer };
