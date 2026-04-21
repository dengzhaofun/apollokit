#!/usr/bin/env node
/**
 * Capture marketing screenshots of the running admin dev server.
 *
 * Usage:
 *   # In one terminal
 *   pnpm dev
 *
 *   # In another
 *   pnpm screenshots
 *
 * Output: screenshots/*.png (commit these — they're referenced from README.md).
 *
 * Playwright is run via `npx -y playwright@^1.59` — not declared as a devDep
 * so CI / first-time contributors aren't forced to download Chromium just to
 * install the repo. The task is opt-in.
 */

import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, "..", "screenshots")
mkdirSync(OUT_DIR, { recursive: true })

const BASE_URL = process.env.APOLLOKIT_BASE ?? "http://localhost:3000"

/**
 * @typedef Shot
 * @property {string} name
 * @property {string} path
 * @property {"dark" | "light"} theme
 * @property {number} width
 * @property {number} height
 * @property {number} [waitMs]
 * @property {string} [scrollToSelector]
 * @property {boolean} [fullPage]
 */

/** @type {Shot[]} */
const SHOTS = [
  // —— Landing —— hero in dark
  {
    name: "landing-hero-dark",
    path: "/",
    theme: "dark",
    width: 1440,
    height: 900,
  },
  // Landing hero in light
  {
    name: "landing-hero-light",
    path: "/",
    theme: "light",
    width: 1440,
    height: 900,
  },
  // Landing full page (tall) in dark — good banner candidate
  {
    name: "landing-full-dark",
    path: "/",
    theme: "dark",
    width: 1440,
    height: 900,
    fullPage: true,
  },
  // Pricing full page in dark
  {
    name: "pricing-full-dark",
    path: "/pricing",
    theme: "dark",
    width: 1440,
    height: 900,
    fullPage: true,
  },
  // Mobile hero in dark
  {
    name: "landing-mobile-dark",
    path: "/",
    theme: "dark",
    width: 390,
    height: 844,
  },
]

async function main() {
  const browser = await chromium.launch()
  try {
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 2,
        colorScheme: shot.theme,
      })
      const page = await ctx.newPage()
      // Seed the theme via localStorage BEFORE navigation so the inline theme
      // script in __root.tsx picks it up on first paint and we avoid a flash.
      await page.addInitScript((theme) => {
        try {
          localStorage.setItem("theme", theme)
        } catch {
          /* ignore */
        }
      }, shot.theme)

      const url = `${BASE_URL}${shot.path}`
      process.stdout.write(`→ ${shot.name} (${shot.width}x${shot.height} · ${shot.theme}) ${url} ... `)

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
      // Wait for the landing root class (React hydration signal).
      await page
        .waitForSelector(".ak-landing", { timeout: 30_000 })
        .catch(() => {
          /* continue anyway if selector not found */
        })
      // Give orbit animations / fonts a moment.
      await page.waitForTimeout(shot.waitMs ?? 1200)

      if (shot.scrollToSelector) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          el?.scrollIntoView({ block: "start" })
        }, shot.scrollToSelector)
        await page.waitForTimeout(400)
      }

      const outPath = resolve(OUT_DIR, `${shot.name}.png`)
      await page.screenshot({
        path: outPath,
        fullPage: shot.fullPage ?? false,
      })
      await ctx.close()
      console.log("ok")
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
