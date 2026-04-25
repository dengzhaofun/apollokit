import type { Locale } from "../paraglide/runtime.js"

const DOCS_MAP: Record<string, string | null> = {
  "/dashboard": "quickstart",
  "/analytics": "analytics",
  "/item": "item",
  "/currency": "currency",
  "/entity": "entity",
  "/exchange": "exchange",
  "/cdkey": "cdkey",
  "/shop": "shop",
  "/storage-box": "storage-box",
  "/mail": "mail",
  "/check-in": "check-in",
  "/banner": "banner",
  "/announcement": "announcement",
  "/activity": "activity",
  "/lottery": "lottery",
  "/friend-gift": "friend-gift",
  "/task": "task",
  "/media-library": "media-library",
  "/dialogue": "dialogue",
  "/collection": "collection",
  "/level": "level",
  "/friend": "friend",
  "/invite": "invite",
  "/guild": "guild",
  "/team": "team",
  "/leaderboard": "leaderboard",
  "/rank": "rank",
  "/end-user": "end-user",
  "/settings/organization": "organizations",
  "/settings/api-keys": "authentication",
  "/settings/webhooks": "webhooks",
  "/settings/account": null,
  "/assist-pool": null,
  "/badge": null,
  "/character": null,
  "/event-catalog": null,
}

const SORTED_KEYS = Object.keys(DOCS_MAP).sort((a, b) => b.length - a.length)

export interface DocsLinkResolution {
  href: string
  hasDoc: boolean
  slug: string | null
}

export function resolveDocsLink(
  pathname: string,
  locale: Locale,
): DocsLinkResolution {
  const match = SORTED_KEYS.find(
    (k) => pathname === k || pathname.startsWith(`${k}/`),
  )
  const slug = match ? DOCS_MAP[match] : undefined
  if (slug) return { href: `/docs/${locale}/${slug}`, hasDoc: true, slug }
  return { href: `/docs/${locale}`, hasDoc: false, slug: null }
}
