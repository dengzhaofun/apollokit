import { useEffect } from 'react'
import { HeadContent, Link, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { RootProvider } from 'fumadocs-ui/provider/tanstack'
import { AlertTriangleIcon, CompassIcon } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { Providers } from '../providers'
import { Button } from '../components/ui/button'
import { ConsentLayer } from '../components/consent/ConsentLayer'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty'
import { getLocale } from '../paraglide/runtime.js'
import { i18n as docsI18n, i18nUI } from '../lib/source'
import { seo } from '../lib/seo'

// A · Linear-style 字体加载顺序:
// - Inter Variable:拉丁主字体,带 cv11/ss01/ss03 备选字形
// - Noto Sans SC Variable:中文 fallback,与 Inter x-height 接近
// - JetBrains Mono Variable:数字/代码/alias 用等宽
// 这三个包提供 .css(@font-face),import 后被打进 bundle 自动加载,没必要走 Google Fonts CDN
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'

import appCss from '../styles.css?url'
// c15t cookie banner / dialog 样式。必须排在 appCss 之后,Tailwind v4 token
// 顺序敏感(参考 c15t v1.7 changelog)。
import c15tCss from '@c15t/react/styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var e=localStorage.getItem("theme")||"system",t="system"===e?window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light":e,r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t);r.style.colorScheme=t}catch(e){}})();`

// `docsI18n.languages` 是 readonly ('zh' | 'en')[],Array.includes 会要求
// 入参也是 'zh' | 'en'。这里我们只想问"这个任意 string 是不是注册过的
// locale",所以宽化成 readonly string[] 再查。
const docsLanguages: readonly string[] = docsI18n.languages

// /docs/{locale}/... 里抽出 locale,不是 docs 路径或第二段不是已注册 locale
// 都返回 null。独立出来方便 RootDocument 里跟 pathname 一起响应式用。
function resolveDocsLocale(pathname: string): string | null {
  const m = pathname.match(/^\/docs\/([^/]+)(?:\/|$)/)
  if (!m) return null
  return docsLanguages.includes(m[1]!) ? m[1]! : null
}

// 切语言时要跳的目标 URL。docs 页保留剩余 slug,非 docs 页保持原路径(仅
// 靠 paraglide cookie 生效)。独立出来是因为要在 window.location.assign 里
// 一次性算清楚,避免跳完再算出错。
function buildLocaleUrl(pathname: string, next: string): string {
  const docsMatch = pathname.match(/^\/docs(?:\/([^/]+))?(\/.*)?$/)
  if (docsMatch) {
    const [, cur, rest = ''] = docsMatch
    if (cur && docsLanguages.includes(cur)) return `/docs/${next}${rest}`
    return `/docs/${next}${pathname.slice('/docs'.length)}`
  }
  return pathname
}

export const Route = createRootRoute({
  head: () => {
    // 站级默认 SEO,子路由(`/`、`/pricing`、docs 等)会用自己的 head 覆盖
    // title/description/og:*。这里只管兜底 + 固定项(charset/viewport/icons)。
    const base = seo({ path: '/' })
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#000000' },
        ...base.meta,
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'stylesheet', href: c15tCss },
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/logo192.png' },
        { rel: 'manifest', href: '/manifest.json' },
        ...base.links,
      ],
    }
  },
  shellComponent: RootDocument,
  /*
   * 全局 404 兜底 —— 任何未知路径(包括手敲错的、过期分享链接、用户输错 alias)
   * 都走这里,而不是显示 TanStack Router 默认的红字 "Not Found"。
   * 错误态 / loading 态选择留给具体页面用 ErrorState / Skeleton(更精准),
   * 不在 root 强加,避免覆盖业务页面已有的细粒度状态处理。
   */
  notFoundComponent: NotFoundPage,
  /*
   * 全局 React 渲染期错误兜底。把异常上报 Sentry,然后渲染一个友好降级页。
   * 业务页面如果实现了自己的 errorComponent / ErrorBoundary,会优先消费,
   * 走不到这里。Sentry SDK 未初始化时 captureException 是 no-op。
   */
  errorComponent: RootErrorBoundary,
})

function NotFoundPage() {
  const isZh = getLocale() === 'zh'
  return (
    <main className="flex min-h-[80vh] items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CompassIcon className="size-4" />
          </EmptyMedia>
          <EmptyTitle>
            {isZh ? '页面找不到' : 'Page not found'}
          </EmptyTitle>
          <EmptyDescription>
            {isZh
              ? '这个链接可能已经过期、被移除,或者是地址敲错了。'
              : 'This link may be expired, removed, or mistyped.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            render={
              <Link to="/dashboard">
                {isZh ? '回到 Dashboard' : 'Back to Dashboard'}
              </Link>
            }
            size="sm"
          />
        </EmptyContent>
      </Empty>
    </main>
  )
}

function RootErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  // 上报放 effect 里跑,避免 SSR 阶段重复上报(captureException 在 SSR 上下文
  // 里没有 Sentry browser SDK,纯 no-op,但 effect 让语义更明确)。
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const isZh = getLocale() === 'zh'
  return (
    <main className="flex min-h-[80vh] items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangleIcon className="size-4" />
          </EmptyMedia>
          <EmptyTitle>
            {isZh ? '页面崩了' : 'Something went wrong'}
          </EmptyTitle>
          <EmptyDescription>
            {isZh
              ? '我们已收到错误报告。可以试着重试,或者回到主页面。'
              : "We've received the error report. Try again or head back to the dashboard."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reset}>
              {isZh ? '重试' : 'Retry'}
            </Button>
            <Button
              render={
                <Link to="/dashboard">
                  {isZh ? '回到 Dashboard' : 'Back to Dashboard'}
                </Link>
              }
              size="sm"
            />
          </div>
        </EmptyContent>
      </Empty>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // 两种 i18n 互相隔离:
  //  - paraglide(getLocale/setLocale,cookie 驱动):管整站 UI 文案(登录、
  //    dashboard 按钮等),跨页面粘性的"我是谁"。
  //  - fumadocs docsLocale(从 /docs/{locale}/... 路径取):只管文档正文 +
  //    文档侧栏 + 文档搜索索引,离开 /docs 就没有意义。
  //
  // 切换其中一个不应影响另一个:读英文文档的人,后台 UI 照样可以是中文。
  // 所以 docsLocale 完全由 pathname 决定,不 fallback 到 paraglide;非 docs
  // 页拿 i18n.defaultLanguage 兜底,让 fumadocs RootProvider 有个合法值
  // (非 docs 页 DocsLayout 不会渲染,context 值其实也用不到)。
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const docsLocale = resolveDocsLocale(pathname)
  const fumadocsLocale = docsLocale ?? docsI18n.defaultLanguage
  // <html lang> 写给屏幕阅读器/搜索引擎看的,应当等于"当前视觉内容"的语言:
  //  - docs 页 → 文档 locale
  //  - 其它页 → paraglide UI locale
  const htmlLang = docsLocale ?? getLocale()

  // 这里的 onLocaleChange 只负责 docs locale 切换,不碰 paraglide cookie;
  // 走 window.location.assign 硬跳,三重作用:
  //  1. Radix Popover 没有自动关闭逻辑,点完 item 下拉框会一直开着——硬跳
  //     整页卸载,popover 跟着 portal 一起销毁,UX 更像官方文档。
  //  2. 避开 i18n context / useRouterState 在新旧 locale 之间的短暂抖动。
  //  3. 如果不在 docs 路径上(理论上不会走到,LanguageSelect 只在 DocsLayout
  //     里出现),降级成原地刷新。
  const onLocaleChange = (next: string) => {
    const target = buildLocaleUrl(pathname, next)
    if (target !== pathname) {
      window.location.assign(target)
    }
  }

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]">
        <RootProvider
          search={{
            options: { api: '/api/v1/search' },
          }}
          i18n={{
            ...i18nUI.provider(fumadocsLocale),
            onLocaleChange,
          }}
        >
          <Providers>
            <ConsentLayer>{children}</ConsentLayer>
          </Providers>
        </RootProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
