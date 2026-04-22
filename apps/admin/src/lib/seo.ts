// SEO helper — 统一路由 `head` 里要塞的 title/description/OG/Twitter/canonical。
// TanStack Start 的 head 合并规则:子路由 meta 会跟父路由 meta 合并,同 key
// 后定义的会覆盖。所以这里尽量多生成字段,让各路由只传差异。

const SITE_NAME = "ApolloKit"
const DEFAULT_TITLE = "ApolloKit — Game SaaS Backend"
const DEFAULT_DESCRIPTION =
  "ApolloKit 是面向游戏团队的一站式 SaaS 后台,开箱即用的活动、玩家、货币、礼品、助力池等通用运营能力。"
const DEFAULT_IMAGE = "/logo512.png"

// 站点绝对地址。Vite 会在构建期把 import.meta.env.VITE_PUBLIC_SITE_URL
// 内联进 bundle,SSR 和 client 都能读到同一个值。没配置时返回空串,调用方
// 会据此跳过 canonical / og:url / og:image 的绝对化。
function siteUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_SITE_URL
  if (typeof raw !== "string") return ""
  return raw.replace(/\/$/, "")
}

// 只把已经是绝对地址或站点域名已知的路径升级为绝对 URL;否则返回 null,
// 调用方用这个信号决定"宁可不出 og:url / canonical 也不发相对 URL"。
function absolute(path: string): string | null {
  if (/^https?:\/\//i.test(path)) return path
  const base = siteUrl()
  if (!base) return null
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

// og:image 允许相对,部分 scraper 会按当前域补全;实在没 SITE_URL 时
// 保底返回相对路径,总比不出图好。
function absoluteOrRelative(path: string): string {
  return absolute(path) ?? path
}

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }

type LinkEntry = { rel: string; href: string; [key: string]: string }

export interface SeoInput {
  title?: string
  description?: string
  image?: string
  /** 当前页路径(以 `/` 开头),helper 会拼成绝对 URL 写进 canonical + og:url */
  path?: string
  type?: "website" | "article"
  noindex?: boolean
  locale?: string
}

export interface SeoHead {
  meta: MetaEntry[]
  links: LinkEntry[]
}

export function seo(input: SeoInput = {}): SeoHead {
  const title = input.title ? `${input.title} · ${SITE_NAME}` : DEFAULT_TITLE
  const description = input.description ?? DEFAULT_DESCRIPTION
  const image = absoluteOrRelative(input.image ?? DEFAULT_IMAGE)
  const type = input.type ?? "website"
  // 没配置 VITE_PUBLIC_SITE_URL 时,path 无从拼成合法绝对 URL,这时就
  // 干脆不输出 canonical / og:url,避免相对地址被爬虫当成错误信号。
  const url = input.path ? absolute(input.path) : absolute("/")

  const meta: MetaEntry[] = [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ]

  if (url) meta.push({ property: "og:url", content: url })
  if (input.locale) meta.push({ property: "og:locale", content: input.locale })
  if (input.noindex) {
    meta.push({ name: "robots", content: "noindex, nofollow" })
  }

  const links: LinkEntry[] = []
  if (url && !input.noindex) {
    links.push({ rel: "canonical", href: url })
  }

  return { meta, links }
}
