/**
 * SSR fidelity POC for @repo/page-blocks.
 *
 * Goal: prove that a `PageProjectSchema` containing every PR-2 block
 * type renders to a non-empty HTML string via `renderToString`, with
 * the visible content actually embedded — not "<div></div>" stubs from
 * a React-Server-Component-only library.
 *
 * If json-render's react renderer turns out to be CSR-only (forbids
 * `renderToString`), this file is what catches it before we wire the
 * pages worker (PR 3). Per plan §2 risk #2, the fallback then is to
 * write our own tiny catalog adapter.
 */

import { describe, expect, test } from "vitest";
import { renderToString } from "react-dom/server";

import { PageRenderer } from "./registry.js";
import { pageProjectSchemaSchema, type PageProjectSchema } from "./schema.js";

const fullSchema: PageProjectSchema = {
  version: 1,
  theme: { primary: "#FF6B35", bg: "#0b0b10", fg: "#ffffff", mode: "dark" },
  pages: [
    {
      id: "home",
      path: "/",
      title: "Spring Check-in",
      seo: { description: "Sign in 7 days for an exclusive avatar." },
      blocks: [
        {
          id: "hero-1",
          type: "hero",
          props: {
            title: "Daily Check-in Bonanza",
            subtitle: "Sign in 7 days in a row.",
            ctaLabel: "Claim",
            ctaHref: "#claim",
          },
        },
        {
          id: "fg-1",
          type: "feature-grid",
          props: {
            heading: "How it works",
            items: [
              { title: "Open daily", description: "Once a day.", icon: "📅" },
              { title: "Earn streaks", description: "7-day bonus.", icon: "🔥" },
              { title: "Redeem", description: "Items in inventory.", icon: "🎁" },
            ],
          },
        },
        {
          id: "auth-1",
          type: "auth-form",
          props: {
            title: "Sign in",
            defaultMode: "sign-in",
            enableMagicLink: true,
          },
        },
        {
          id: "footer-1",
          type: "footer",
          props: {
            brandName: "Apollo Game Studio",
            tagline: "Made with care.",
            links: [
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
            ],
            copyrightYear: 2026,
          },
        },
      ],
    },
  ],
  defaultPageId: "home",
};

describe("PageRenderer SSR fidelity", () => {
  test("schema fixture passes outer zod validation", () => {
    expect(() => pageProjectSchemaSchema.parse(fullSchema)).not.toThrow();
  });

  test("renderToString produces non-empty HTML", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html.length).toBeGreaterThan(500);
  });

  test("hero block renders headline + CTA", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html).toContain("Daily Check-in Bonanza");
    expect(html).toContain("Sign in 7 days in a row.");
    expect(html).toContain("Claim");
    expect(html).toContain('href="#claim"');
  });

  test("feature-grid renders every item title and icon", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html).toContain("How it works");
    expect(html).toContain("Open daily");
    expect(html).toContain("Earn streaks");
    expect(html).toContain("Redeem");
    expect(html).toContain("📅");
    expect(html).toContain("🔥");
    expect(html).toContain("🎁");
  });

  test("auth-form renders the password + email inputs and form action", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html).toContain('action="/api/auth/sign-in/email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    // magic-link alt button
    expect(html).toContain("/api/auth/sign-in/magic-link");
  });

  test("footer renders brand + links + copyright with explicit year", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html).toContain("Apollo Game Studio");
    expect(html).toContain("Made with care.");
    expect(html).toContain("/terms");
    expect(html).toContain("/privacy");
    expect(html).toContain("2026");
  });

  test("data-block markers present for every rendered block type", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    expect(html).toContain('data-block="hero"');
    expect(html).toContain('data-block="feature-grid"');
    expect(html).toContain('data-block="auth-form"');
    expect(html).toContain('data-block="footer"');
  });

  test("theme tokens injected as CSS variables on page root", () => {
    const html = renderToString(<PageRenderer schema={fullSchema} />);
    // React serialises CSS custom props verbatim in the inline style.
    expect(html).toContain("--page-primary:#FF6B35");
    expect(html).toContain("--page-bg:#0b0b10");
    expect(html).toContain("--page-fg:#ffffff");
    // Auto-derived primary-fg (luminance heuristic on #FF6B35 → light)
    expect(html).toContain("--page-primary-fg:");
  });

  test("auth-gate fallback shown when signedIn=false", () => {
    const gated: PageProjectSchema = {
      version: 1,
      theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
      pages: [
        {
          id: "p",
          path: "/",
          title: "G",
          blocks: [
            {
              id: "h",
              type: "hero",
              props: { title: "Members only" },
              authGate: "requireUser",
            },
          ],
        },
      ],
      defaultPageId: "p",
    };
    const locked = renderToString(
      <PageRenderer schema={gated} context={{ signedIn: false }} />,
    );
    expect(locked).toContain("Sign in to continue");
    expect(locked).not.toContain("Members only");

    const unlocked = renderToString(
      <PageRenderer schema={gated} context={{ signedIn: true }} />,
    );
    expect(unlocked).toContain("Members only");
    expect(unlocked).not.toContain("Sign in to continue");
  });

  test("unknown block type renders inline error stub instead of throwing", () => {
    const broken: PageProjectSchema = {
      version: 1,
      theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
      pages: [
        {
          id: "p",
          path: "/",
          title: "X",
          blocks: [
            { id: "x", type: "non-existent-block", props: {} },
          ],
        },
      ],
      defaultPageId: "p",
    };
    const html = renderToString(<PageRenderer schema={broken} />);
    expect(html).toContain("Unknown block type");
    expect(html).toContain("non-existent-block");
  });
});
