/**
 * Module-binding block tests (PR 5).
 *
 * For each of the 6 blocks (check-in / shop / lottery / cdkey /
 * leaderboard / mail) we cover:
 *   - props zod accepts a minimal valid input
 *   - props zod rejects an obvious bad input
 *   - SSR via `<PageRenderer />` produces HTML containing the block's
 *     visible signal (heading / row text / button label)
 *   - data-block marker is set so the pages worker can introspect
 *
 * These are deliberately shallow — exhaustive UX testing belongs in
 * a separate visual-regression suite. The point here is to catch
 * regressions in the SSR contract and the zod schema simultaneously.
 */

import { describe, expect, test } from "vitest";
import { renderToString } from "react-dom/server";

import {
  ActivityForm,
  activityFormPropsSchema,
} from "./components/activity-form.js";
import { badgeWallPropsSchema } from "./components/badge-wall.js";
import { cdkeyRedeemPropsSchema } from "./components/cdkey-redeem.js";
import { checkInBoardPropsSchema } from "./components/check-in-board.js";
import { leaderboardCardPropsSchema } from "./components/leaderboard-card.js";
import { lotteryWheelPropsSchema } from "./components/lottery-wheel.js";
import { mailInboxPropsSchema } from "./components/mail-inbox.js";
import { shopGridPropsSchema } from "./components/shop-grid.js";
import { moduleLoaders, resolveLoader } from "./bindings.js";
import { PageRenderer } from "./registry.js";
import type { PageProjectSchema } from "./schema.js";

function pageWithBlock(
  type: string,
  props: Record<string, unknown>,
  binding?: { module: string },
): PageProjectSchema {
  return {
    version: 1,
    theme: { primary: "#FF6B35", bg: "#0b0b10", fg: "#ffffff" },
    pages: [
      {
        id: "home",
        path: "/",
        title: "T",
        blocks: [
          {
            id: "b-1",
            type,
            props,
            ...(binding ? { binding } : {}),
          },
        ],
      },
    ],
    defaultPageId: "home",
  };
}

// ─── check-in-board ──────────────────────────────────────────────

describe("check-in-board", () => {
  test("props schema accepts minimal config", () => {
    expect(() => checkInBoardPropsSchema.parse({})).not.toThrow();
    expect(() =>
      checkInBoardPropsSchema.parse({ cycleLength: 7 }),
    ).not.toThrow();
  });

  test("props schema rejects unknown cycleLength", () => {
    expect(() =>
      checkInBoardPropsSchema.parse({ cycleLength: 100 }),
    ).toThrow();
  });

  test("SSR renders 7 cells by default + claim CTA", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "check-in-board",
          { heading: "Daily Check-in", cycleLength: 7 },
          { module: "check-in" },
        )}
      />,
    );
    expect(html).toContain("Daily Check-in");
    expect(html).toContain('data-block="check-in-board"');
    expect(html).toContain('data-day="1"');
    expect(html).toContain('data-day="7"');
    expect(html).toContain("/api/v1/client/check-in/claim");
    expect(html).toContain("Claim today");
  });
});

// ─── shop-grid ───────────────────────────────────────────────────

describe("shop-grid", () => {
  test("props schema accepts shopId-only", () => {
    expect(() =>
      shopGridPropsSchema.parse({ shopId: "spring-2026" }),
    ).not.toThrow();
  });

  test("props schema rejects too-many items", () => {
    const items = Array.from({ length: 49 }, (_, i) => ({
      id: `i-${i}`,
      name: `Item ${i}`,
      price: "10",
    }));
    expect(() => shopGridPropsSchema.parse({ items })).toThrow();
  });

  test("SSR renders item names + buy form actions", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "shop-grid",
          {
            heading: "Spring Shop",
            shopId: "spring-2026",
            items: [
              { id: "sword", name: "Holy Sword", price: "500g" },
              { id: "shield", name: "Sun Shield", price: "300g" },
            ],
          },
          { module: "shop" },
        )}
      />,
    );
    expect(html).toContain("Holy Sword");
    expect(html).toContain("Sun Shield");
    expect(html).toContain("/api/v1/client/shop/items/sword/redeem");
    expect(html).toContain("/api/v1/client/shop/items/shield/redeem");
    expect(html).toContain('data-block="shop-grid"');
    expect(html).toContain('data-shop-id="spring-2026"');
  });

  test("SSR renders empty state when no items + no initialData", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "shop-grid",
          { shopId: "x", emptyMessage: "Coming soon." },
          { module: "shop" },
        )}
      />,
    );
    expect(html).toContain("Coming soon.");
    expect(html).toContain('data-empty="true"');
  });
});

// ─── lottery-wheel ───────────────────────────────────────────────

describe("lottery-wheel", () => {
  test("props schema rejects bad rarity (too-long)", () => {
    expect(() =>
      lotteryWheelPropsSchema.parse({
        prizes: [
          { id: "p1", name: "Gold", rarity: "x".repeat(50) },
        ],
      }),
    ).toThrow();
  });

  test("SSR renders prize names + Spin form", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "lottery-wheel",
          {
            heading: "Spring Wheel",
            lotteryId: "spring-wheel",
            prizes: [
              { id: "p1", name: "Gold Coin" },
              { id: "p2", name: "Silver Egg" },
            ],
            costLabel: "1 spin = 100 gold",
          },
          { module: "lottery" },
        )}
      />,
    );
    expect(html).toContain("Spring Wheel");
    expect(html).toContain("Gold Coin");
    expect(html).toContain("Silver Egg");
    expect(html).toContain("1 spin = 100 gold");
    expect(html).toContain("/api/v1/client/lottery/spring-wheel/pull");
    expect(html).toContain('data-block="lottery-wheel"');
  });
});

// ─── cdkey-redeem ────────────────────────────────────────────────

describe("cdkey-redeem", () => {
  test("props schema accepts empty config (uses defaults)", () => {
    expect(() => cdkeyRedeemPropsSchema.parse({})).not.toThrow();
  });

  test("SSR renders form + hidden campaignId when provided", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "cdkey-redeem",
          {
            heading: "Redeem code",
            campaignId: "spring-codes",
            ctaLabel: "Use code",
          },
          { module: "cdkey" },
        )}
      />,
    );
    expect(html).toContain("Redeem code");
    expect(html).toContain('action="/api/v1/client/cdkey/redeem"');
    expect(html).toContain('name="code"');
    expect(html).toContain('name="campaignId"');
    expect(html).toContain('value="spring-codes"');
    expect(html).toContain("Use code");
    expect(html).toContain('data-block="cdkey-redeem"');
  });
});

// ─── leaderboard-card ────────────────────────────────────────────

describe("leaderboard-card", () => {
  test("props schema rejects topN < 3", () => {
    expect(() =>
      leaderboardCardPropsSchema.parse({ topN: 2 }),
    ).toThrow();
  });

  test("SSR renders ranked entries with self-highlight", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "leaderboard-card",
          {
            heading: "Top 3",
            leaderboardId: "spring-arena",
            topN: 3,
            entries: [
              { rank: 1, endUserId: "u1", displayName: "Alice", score: "100" },
              { rank: 2, endUserId: "u2", displayName: "Bob", score: "80", isMe: true },
              { rank: 3, endUserId: "u3", displayName: "Carol", score: "60" },
            ],
          },
          { module: "leaderboard" },
        )}
      />,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Carol");
    expect(html).toContain("100");
    expect(html).toContain('data-self="true"');
    expect(html).toContain('data-block="leaderboard-card"');
    expect(html).toContain('data-leaderboard-id="spring-arena"');
  });
});

// ─── mail-inbox ──────────────────────────────────────────────────

describe("mail-inbox", () => {
  test("props schema rejects > 100 mails", () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      id: `m-${i}`,
      subject: `Mail ${i}`,
      receivedAt: "2026-05-05",
    }));
    expect(() => mailInboxPropsSchema.parse({ items })).toThrow();
  });

  test("SSR renders mail rows + per-mail Claim form", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "mail-inbox",
          {
            heading: "Inbox",
            items: [
              {
                id: "mail-1",
                subject: "Welcome bonus",
                preview: "Thanks for joining.",
                rewardSummary: "+100 gold",
                receivedAt: "2026-05-05",
              },
              {
                id: "mail-2",
                subject: "Old news",
                receivedAt: "2026-05-01",
                read: true,
              },
            ],
          },
          { module: "mail" },
        )}
      />,
    );
    expect(html).toContain("Welcome bonus");
    expect(html).toContain("Old news");
    expect(html).toContain("+100 gold");
    expect(html).toContain("/api/v1/client/mail/mail-1/claim");
    expect(html).toContain('data-block="mail-inbox"');
  });
});

// ─── activity-form ───────────────────────────────────────────────

describe("activity-form", () => {
  test("props schema requires at least one field", () => {
    expect(() => activityFormPropsSchema.parse({ fields: [] })).toThrow();
    expect(() =>
      activityFormPropsSchema.parse({
        fields: [{ id: "f", type: "text", label: "F" }],
      }),
    ).not.toThrow();
  });

  test("props schema rejects unknown field type", () => {
    expect(() =>
      activityFormPropsSchema.parse({
        fields: [{ id: "f", type: "unknown", label: "F" }],
      }),
    ).toThrow();
  });

  test("SSR renders inputs of all four types + hidden ids", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock("activity-form", {
          heading: "Sign up",
          fields: [
            { id: "name", type: "text", label: "Name", required: true },
            { id: "email", type: "email", label: "Email" },
            { id: "size", type: "select", label: "Size", options: [{ value: "s", label: "Small" }] },
            { id: "agree", type: "checkbox", label: "Agree" },
            { id: "feedback", type: "textarea", label: "Feedback" },
          ],
          ctaLabel: "Submit",
        })}
      />,
    );
    expect(html).toContain('action="/api/v1/client/page/forms"');
    expect(html).toContain('name="payload.name"');
    expect(html).toContain("type=\"email\"");
    expect(html).toContain("<select");
    expect(html).toContain("Small");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("<textarea");
    expect(html).toContain('data-block="activity-form"');
  });

  test("SSR injects projectId/pageId/blockId hidden inputs when initialData present", () => {
    // initialData isn't carried through json-render's spec at this
    // layer, but the component itself accepts it. Verified by direct
    // render below — the SSR path is exercised in PR 8 when the
    // pages worker SSR loader fills initialData.
    const html = renderToString(
      <ActivityForm
        fields={[{ id: "x", type: "text", label: "X" }]}
        initialData={{
          projectId: "p-1",
          pageId: "home",
          blockId: "b-1",
        }}
      />,
    );
    expect(html).toContain('name="projectId"');
    expect(html).toContain('value="p-1"');
    expect(html).toContain('name="pageId"');
    expect(html).toContain('value="home"');
    expect(html).toContain('name="blockId"');
    expect(html).toContain('value="b-1"');
  });
});

// ─── badge-wall ──────────────────────────────────────────────────

describe("badge-wall", () => {
  test("props schema rejects > 60 badges", () => {
    const badges = Array.from({ length: 61 }, (_, i) => ({
      id: `b-${i}`,
      name: `Badge ${i}`,
    }));
    expect(() => badgeWallPropsSchema.parse({ badges })).toThrow();
  });

  test("SSR renders earned vs unearned with opacity hint + summary", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock(
          "badge-wall",
          {
            heading: "Achievements",
            badges: [
              { id: "first-login", name: "First Login", earned: true, tier: "bronze" },
              { id: "win-100", name: "Win 100", earned: false, tier: "gold" },
            ],
          },
          { module: "badge" },
        )}
      />,
    );
    expect(html).toContain("Achievements");
    expect(html).toContain("First Login");
    expect(html).toContain("Win 100");
    expect(html).toContain('data-earned="true"');
    expect(html).toContain('data-earned="false"');
    expect(html).toContain('data-tier="bronze"');
    expect(html).toContain('data-tier="gold"');
    // React serializes "1 / 2 earned" with HTML comments between text nodes;
    // assert via the data-summary element + the surrounding "earned" word.
    expect(html).toContain("data-summary");
    expect(html).toMatch(/1[\s\S]*\/[\s\S]*2[\s\S]*earned/);
    expect(html).toContain('data-block="badge-wall"');
  });

  test("earnedOnly hides unearned badges", () => {
    const html = renderToString(
      <PageRenderer
        schema={pageWithBlock("badge-wall", {
          earnedOnly: true,
          badges: [
            { id: "earned-1", name: "Earned A", earned: true },
            { id: "locked-1", name: "Locked B", earned: false },
          ],
        })}
      />,
    );
    expect(html).toContain("Earned A");
    expect(html).not.toContain("Locked B");
  });
});

// ─── bindings registry ───────────────────────────────────────────

describe("moduleLoaders registry", () => {
  test("registers a loader for every game module bound by PR 5/6 blocks", () => {
    for (const module of [
      "check-in",
      "shop",
      "lottery",
      "cdkey",
      "leaderboard",
      "mail",
      "badge",
    ]) {
      expect(moduleLoaders[module]).toBeDefined();
    }
  });

  test("resolveLoader returns the registered loader for known modules", () => {
    const loader = resolveLoader({ module: "check-in" });
    expect(typeof loader).toBe("function");
  });

  test("resolveLoader returns undefined for unknown module", () => {
    expect(resolveLoader({ module: "nonexistent" })).toBeUndefined();
  });

  test("stub loaders return null data (PR 5 placeholder)", async () => {
    const loader = resolveLoader({ module: "check-in" });
    expect(loader).toBeDefined();
    const result = await loader!(
      { module: "check-in" },
      { id: "b", type: "check-in-board", props: {} },
      {
        projectId: "p",
        tenantId: "t",
        endUserId: null,
        fetchClient: (async () => null) as never,
      },
    );
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});
